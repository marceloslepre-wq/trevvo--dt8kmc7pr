import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'

import { obterSessaoAbertaOperador, CaixaSessao } from '@/services/caixa'
import { resolverOperadorErpId } from '@/services/operadorErp'
import { listarTerminais, PdvTerminal } from '@/services/terminais'
import {
  obterOuCriarConfigVendasEmpresa,
  obterOuCriarConsumidorFinal,
  ConfigVendasEmpresa,
} from '@/services/configVendas'
import { listarFormasPagamento, FormaPagamento } from '@/services/formasPagamento'
import { listarContasFinanceiras, ContaFinanceira } from '@/services/contasFinanceiras'
import { listarTodasCondicoesAtivas, CondicaoPagamento } from '@/services/condicoesPagamento'
import {
  salvarVenda,
  finalizarVenda,
  obterVendaCompleta,
  SalvarVendaInput,
  Venda,
  VendaItem,
  VendaPagamento,
} from '@/services/vendas'
import { imprimirComprovanteNaoFiscal, DadosImpressaoVenda } from '@/services/vendasImpressao'
import { registrarAuditoria } from '@/services/auditoria'
import type { Produto } from '@/services/produtos'
import type { Cliente } from '@/services/clientes'
import type { Usuario } from '@/services/usuarios'

import {
  ItemCarrinhoPDV,
  VendaRascunhoPDV,
  salvarRascunhoPDV,
  obterRascunhoPDV,
  limparRascunhoPDV,
  carregarCatalogoProdutosPDV,
  interpretarEntradaPDV,
} from '@/services/pdv'

import { ModalAbrirCaixa } from '@/pages/vendas/caixa/ModalAbrirCaixa'
import { ModalSangria } from '@/pages/vendas/caixa/ModalSangria'
import { ModalSuprimento } from '@/pages/vendas/caixa/ModalSuprimento'
import { ModalPagamentoPDV } from './ModalPagamentoPDV'
import { ModalBuscaProdutoPDV } from './ModalBuscaProdutoPDV'
import { ModalClientePDV } from './ModalClientePDV'
import { ModalVendedorPDV } from './ModalVendedorPDV'
import {
  ModalQuantidadeItemPDV,
  ModalDescontoItemPDV,
  ModalDescontoTotalPDV,
  ModalCancelarItemPDV,
} from './ModaisOperacoesPDV'

import {
  Barcode,
  Search,
  ShoppingCart,
  User,
  UserCheck,
  Percent,
  XCircle,
  ArrowRightLeft,
  DollarSign,
  Maximize2,
  Minimize2,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Package,
  Receipt,
  Printer,
  RefreshCw,
} from 'lucide-react'
import { obterConfigFiscalEmpresa, ConfigEmissaoFiscal } from '@/services/configEmissaoFiscal'
import { emitirNFCeVenda, imprimirDanfeUrl } from '@/services/fiscalIntegracao'

export const PdvPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { user } = useAuth()
  const { usuarioERP, pode } = usePermissoes()
  const usuario = usuarioERP || (user ? { id: user.id, nome: user.name || user.email } : null)
  const { toast } = useToast()
  const navigate = useNavigate()

  // Sessão de Caixa e Terminal
  const [sessaoCaixa, setSessaoCaixa] = useState<CaixaSessao | null>(null)
  const [terminais, setTerminais] = useState<PdvTerminal[]>([])
  const [terminalAtivo, setTerminalAtivo] = useState<PdvTerminal | null>(null)
  const [configVendas, setConfigVendas] = useState<ConfigVendasEmpresa | null>(null)
  const [configFiscal, setConfigFiscal] = useState<ConfigEmissaoFiscal | null>(null)
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([])
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([])
  const [condicoesPagamento, setCondicoesPagamento] = useState<CondicaoPagamento[]>([])

  // Modal de Aviso de Rejeição de NFC-e no PDV
  const [modalRejeicaoNfceAberto, setModalRejeicaoNfceAberto] = useState(false)
  const [dadosRejeicaoNfce, setDadosRejeicaoNfce] = useState<{
    vendaId: string
    numeroVenda: number
    motivo: string
    erroInterno?: boolean
  } | null>(null)
  const [reemitindoNfce, setReemitindoNfce] = useState(false)

  // Catálogo de produtos em memória
  const [produtosCatalogo, setProdutosCatalogo] = useState<Produto[]>([])
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(false)

  // Status de rede
  const [online, setOnline] = useState(navigator.onLine)

  // Estado da Venda Atual
  const [itens, setItens] = useState<ItemCarrinhoPDV[]>([])
  const [descontoTotal, setDescontoTotal] = useState(0)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [cpfCnpjCupom, setCpfCnpjCupom] = useState('')
  const [vendedor, setVendedor] = useState<Usuario | null>(null)

  // Leitura de Entrada
  const [entradaLeitor, setEntradaLeitor] = useState('')
  const inputLeitorRef = useRef<HTMLInputElement>(null)
  const [mensagemStatus, setMensagemStatus] = useState<string | null>(null)
  const [tipoMensagemStatus, setTipoMensagemStatus] = useState<'info' | 'erro' | 'sucesso'>('info')

  // Relógio Topo
  const [horaAtual, setHoraAtual] = useState(new Date().toLocaleTimeString('pt-BR'))

  // Tela Cheia
  const [isFullScreen, setIsFullScreen] = useState(false)

  // Modais
  const [modalAbrirCaixaAberto, setModalAbrirCaixaAberto] = useState(false)
  const [modalSangriaAberto, setModalSangriaAberto] = useState(false)
  const [modalSuprimentoAberto, setModalSuprimentoAberto] = useState(false)
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false)
  const [modalBuscaProdutoAberto, setModalBuscaProdutoAberto] = useState(false)
  const [modalClienteAberto, setModalClienteAberto] = useState(false)
  const [modalVendedorAberto, setModalVendedorAberto] = useState(false)
  const [modalQtdItemAberto, setModalQtdItemAberto] = useState(false)
  const [modalDescontoItemAberto, setModalDescontoItemAberto] = useState(false)
  const [modalDescontoTotalAberto, setModalDescontoTotalAberto] = useState(false)
  const [modalCancelarItemAberto, setModalCancelarItemAberto] = useState(false)
  const [modalPerguntaRascunhoAberto, setModalPerguntaRascunhoAberto] = useState(false)
  const [rascunhoPendente, setRascunhoPendente] = useState<VendaRascunhoPDV | null>(null)

  // Lista com auto-scroll
  const itensFimRef = useRef<HTMLDivElement>(null)

  // Foco no campo de leitura sempre que possível
  const focarLeitor = useCallback(() => {
    setTimeout(() => {
      inputLeitorRef.current?.focus()
    }, 60)
  }, [])

  // Atualiza relógio
  useEffect(() => {
    const timer = setInterval(() => {
      setHoraAtual(new Date().toLocaleTimeString('pt-BR'))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Monitora online/offline
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      toast({ title: 'Conexão restabelecida', description: 'Sistema PDV online.' })
    }
    const handleOffline = () => {
      setOnline(false)
      toast({
        title: 'Sem conexão com a internet',
        description: 'Vendas não poderão ser finalizadas até a conexão voltar.',
        variant: 'destructive',
      })
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [toast])

  // Carrega configurações iniciais
  const carregarDadosIniciais = useCallback(async () => {
    if (!empresaAtiva?.id) return

    try {
      // Sessão de caixa é gravada com o id do registro ERP (coleção usuarios),
      // não com o id do login (coleção users) — mesmo caso das v0.0.249/v0.0.251.
      const operadorErpId = usuarioERP?.id || (await resolverOperadorErpId()) || ''
      if (!operadorErpId) return

      const [sessao, terms, cfg, formas, contas, conds, cfgFiscal] = await Promise.all([
        obterSessaoAbertaOperador(empresaAtiva.id, operadorErpId),
        listarTerminais(empresaAtiva.id),
        obterOuCriarConfigVendasEmpresa(empresaAtiva.id),
        listarFormasPagamento(empresaAtiva.id),
        listarContasFinanceiras(empresaAtiva.id),
        listarTodasCondicoesAtivas('Vendas'),
        obterConfigFiscalEmpresa(empresaAtiva.id).catch(() => null),
      ])

      setSessaoCaixa(sessao)
      setTerminais(terms)
      setConfigVendas(cfg)
      setConfigFiscal(cfgFiscal)
      setFormasPagamento(formas)
      setContasFinanceiras(contas)
      setCondicoesPagamento(conds)

      if (sessao?.pdv_terminal_id) {
        const t = terms.find((term) => term.id === sessao.pdv_terminal_id) || null
        setTerminalAtivo(t)
      } else if (terms.length > 0) {
        setTerminalAtivo(terms[0])
      }

      if (!sessao) {
        setModalAbrirCaixaAberto(true)
      }
    } catch (err) {
      console.error('Erro ao carregar dados iniciais do PDV:', err)
    }
  }, [empresaAtiva?.id, usuarioERP?.id])

  useEffect(() => {
    carregarDadosIniciais()
  }, [carregarDadosIniciais])

  // Carrega catálogo de produtos na inicialização e atualiza a cada 5 minutos
  const recarregarProdutos = useCallback(
    async (forcar = false) => {
      if (!empresaAtiva?.id) return
      setCarregandoCatalogo(true)
      try {
        const prods = await carregarCatalogoProdutosPDV(empresaAtiva.id, forcar)
        setProdutosCatalogo(prods)
      } catch (err) {
        console.error('Falha ao carregar produtos no PDV:', err)
      } finally {
        setCarregandoCatalogo(false)
      }
    },
    [empresaAtiva?.id],
  )

  useEffect(() => {
    recarregarProdutos(false)
    const interval = setInterval(
      () => {
        recarregarProdutos(true)
      },
      5 * 60 * 1000,
    )
    return () => clearInterval(interval)
  }, [recarregarProdutos])

  // Checa se há rascunho salvo no localStorage
  useEffect(() => {
    if (empresaAtiva?.id) {
      const rascunho = obterRascunhoPDV(empresaAtiva.id)
      if (rascunho && rascunho.itens.length > 0) {
        setRascunhoPendente(rascunho)
        setModalPerguntaRascunhoAberto(true)
      }
    }
  }, [empresaAtiva?.id])

  // Salva rascunho sempre que itens mudarem
  useEffect(() => {
    if (!empresaAtiva?.id) return
    if (itens.length > 0) {
      salvarRascunhoPDV({
        versao: 1,
        timestamp: Date.now(),
        empresa_id: empresaAtiva.id,
        terminal_id: terminalAtivo?.id,
        caixa_sessao_id: sessaoCaixa?.id,
        cliente_id: cliente?.id || '',
        cliente_nome: cliente?.nome_razao_social,
        cpf_cnpj_consumidor: cpfCnpjCupom,
        vendedor_id: vendedor?.id,
        vendedor_nome: vendedor?.nome,
        desconto_total_valor: descontoTotal,
        itens,
      })
    } else {
      limparRascunhoPDV()
    }
  }, [
    itens,
    descontoTotal,
    cliente,
    cpfCnpjCupom,
    vendedor,
    empresaAtiva?.id,
    terminalAtivo?.id,
    sessaoCaixa?.id,
  ])

  // Totais calculados
  const subtotalItens = useMemo(() => {
    return itens.reduce((acc, it) => acc + it.valor_total, 0)
  }, [itens])

  const totalVendaFinal = useMemo(() => {
    const tot = subtotalItens - descontoTotal
    return Math.max(0, Number(tot.toFixed(2)))
  }, [subtotalItens, descontoTotal])

  const totalQuantidadeGeral = useMemo(() => {
    return itens.reduce((acc, it) => acc + it.quantidade, 0)
  }, [itens])

  const ultimoItem = useMemo(() => {
    if (itens.length === 0) return null
    return itens[itens.length - 1]
  }, [itens])

  // Adicionar produto ao carrinho — exige sessão de caixa aberta antes de lançar itens
  const adicionarProdutoAoCarrinho = useCallback(
    (
      produto: Produto,
      quantidade: number,
      precoUnitarioCustom?: number,
      ehBalanca = false,
      pesoBalancaKg?: number,
    ) => {
      if (!sessaoCaixa) {
        setMensagemStatus('Abra o caixa antes de lançar itens na venda.')
        setTipoMensagemStatus('erro')
        setModalAbrirCaixaAberto(true)
        return
      }
      const precoUnit =
        precoUnitarioCustom !== undefined
          ? precoUnitarioCustom
          : produto.preco_promocional && produto.preco_promocional > 0
            ? produto.preco_promocional
            : produto.preco_venda || 0

      const totalItem = Number((precoUnit * quantidade).toFixed(2))

      const novoItem: ItemCarrinhoPDV = {
        tempId: Math.random().toString(36).substring(2, 9),
        item: itens.length + 1,
        produto_id: produto.id,
        codigo: produto.codigo,
        descricao: produto.descricao,
        unidade: produto.expand?.unidade_id?.sigla || 'UN',
        quantidade,
        preco_unitario: precoUnit,
        preco_tabela: produto.preco_venda || precoUnit,
        desconto_percentual: 0,
        desconto_valor: 0,
        acrescimo_valor: 0,
        valor_total: totalItem,
        foto: produto.foto ? pb.files.getURL(produto, produto.foto) : undefined,
        peso_liquido_kg:
          pesoBalancaKg ||
          (produto.peso_liquido_kg ? produto.peso_liquido_kg * quantidade : undefined),
        saldo_estoque: undefined,
        eh_balanca: false,
        ncm: produto.ncm,
        cest: produto.cest,
        cfop: produto.cfop_venda_interna || undefined,
      }

      setItens((prev) => [...prev, novoItem])
      setMensagemStatus(
        `Item adicionado: ${produto.descricao} (${quantidade} x R$ ${precoUnit.toFixed(2)})`,
      )
      setTipoMensagemStatus('sucesso')

      setTimeout(() => {
        itensFimRef.current?.scrollIntoView({ behavior: 'smooth' })
        focarLeitor()
      }, 50)
    },
    [itens.length, focarLeitor, sessaoCaixa],
  )

  // Leitura do campo principal (Enter)
  const handleProcessarLeitura = (e: React.FormEvent) => {
    e.preventDefault()
    const entrada = entradaLeitor.trim()
    if (!entrada) return

    setEntradaLeitor('')

    const res = interpretarEntradaPDV(entrada, produtosCatalogo, configVendas)

    if (!res.sucesso || !res.produto) {
      setMensagemStatus(res.mensagemErro || 'Código não identificado.')
      setTipoMensagemStatus('erro')
      focarLeitor()
      return
    }

    const ehBalanca = Boolean(res.balanca?.ehEtiquetaBalanca)
    adicionarProdutoAoCarrinho(
      res.produto,
      res.quantidade,
      res.precoUnitario,
      ehBalanca,
      res.balanca?.pesoKg,
    )
  }

  // Atalhos de teclado globais
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Se qualquer modal estiver aberto, deixa o modal gerenciar seus atalhos
      const algumModalAberto =
        modalAbrirCaixaAberto ||
        modalSangriaAberto ||
        modalSuprimentoAberto ||
        modalPagamentoAberto ||
        modalBuscaProdutoAberto ||
        modalClienteAberto ||
        modalVendedorAberto ||
        modalQtdItemAberto ||
        modalDescontoItemAberto ||
        modalDescontoTotalAberto ||
        modalCancelarItemAberto ||
        modalPerguntaRascunhoAberto

      if (algumModalAberto) {
        if (e.key === 'Escape') {
          focarLeitor()
        }
        return
      }

      switch (e.key) {
        case 'F2':
          e.preventDefault()
          setModalBuscaProdutoAberto(true)
          break
        case 'F3':
          e.preventDefault()
          setModalClienteAberto(true)
          break
        case 'F4':
          e.preventDefault()
          if (itens.length > 0) {
            setModalQtdItemAberto(true)
          } else {
            toast({
              title: 'Nenhum item na venda',
              description: 'Adicione itens antes de alterar quantidade.',
            })
          }
          break
        case 'F5':
          e.preventDefault()
          setModalVendedorAberto(true)
          break
        case 'F6':
          e.preventDefault()
          if (itens.length > 0) {
            setModalDescontoItemAberto(true)
          } else {
            toast({
              title: 'Nenhum item na venda',
              description: 'Adicione itens antes de dar desconto.',
            })
          }
          break
        case 'F7':
          e.preventDefault()
          if (itens.length > 0) {
            setModalDescontoTotalAberto(true)
          } else {
            toast({
              title: 'Nenhum item na venda',
              description: 'Adicione itens antes de dar desconto.',
            })
          }
          break
        case 'F8':
          e.preventDefault()
          if (itens.length > 0) {
            setModalCancelarItemAberto(true)
          } else {
            toast({ title: 'Nenhum item na venda', description: 'Não há itens para cancelar.' })
          }
          break
        case 'F9':
          e.preventDefault()
          if (!sessaoCaixa) {
            setModalAbrirCaixaAberto(true)
          } else {
            setModalSangriaAberto(true)
          }
          break
        case 'F10':
          e.preventDefault()
          if (itens.length === 0) {
            toast({
              title: 'Venda vazia',
              description: 'Insira pelo menos um produto antes de finalizar.',
              variant: 'destructive',
            })
            return
          }
          if (!online) {
            toast({
              title: 'Sem conexão com a internet',
              description: 'O PDV está offline. Conecte-se para finalizar a venda.',
              variant: 'destructive',
            })
            return
          }
          if (!sessaoCaixa) {
            toast({
              title: 'Caixa Fechado',
              description: 'Abra o caixa do operador antes de finalizar a venda.',
              variant: 'destructive',
            })
            setModalAbrirCaixaAberto(true)
            return
          }
          setModalPagamentoAberto(true)
          break
        case 'F12':
          e.preventDefault()
          if (itens.length > 0) {
            handleCancelarVendaEmAndamento()
          }
          break
        case 'Escape':
          focarLeitor()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [
    modalAbrirCaixaAberto,
    modalSangriaAberto,
    modalSuprimentoAberto,
    modalPagamentoAberto,
    modalBuscaProdutoAberto,
    modalClienteAberto,
    modalVendedorAberto,
    modalQtdItemAberto,
    modalDescontoItemAberto,
    modalDescontoTotalAberto,
    modalCancelarItemAberto,
    modalPerguntaRascunhoAberto,
    itens.length,
    online,
    sessaoCaixa,
    toast,
    focarLeitor,
  ])

  // Cancelar Venda Em Andamento (F12) com auditoria
  const handleCancelarVendaEmAndamento = async () => {
    if (!window.confirm('Deseja realmente cancelar toda a venda em andamento?')) {
      focarLeitor()
      return
    }

    if (empresaAtiva?.id) {
      try {
        await registrarAuditoria({
          tabela: 'vendas',
          registro_id: sessaoCaixa?.id || 'PDV',
          acao: 'CANCELAR_VENDA_PDV_EM_ANDAMENTO',
          empresa_id: empresaAtiva.id,
          valores_antes: {
            descricao: `Cancelamento de venda PDV em andamento com ${itens.length} itens no valor total de R$ ${totalVendaFinal.toFixed(2)}.`,
            itens: itens.map((it) => ({
              codigo: it.codigo,
              descricao: it.descricao,
              quantidade: it.quantidade,
              total: it.valor_total,
            })),
            totalVendaFinal,
          },
        })
      } catch (err) {
        console.warn('Erro ao registrar auditoria de cancelamento:', err)
      }
    }

    setItens([])
    setDescontoTotal(0)
    setCliente(null)
    setCpfCnpjCupom('')
    limparRascunhoPDV()
    setMensagemStatus('Venda cancelada pelo operador.')
    setTipoMensagemStatus('info')
    focarLeitor()
  }

  // Cancelar Item Específico (F8) com auditoria
  const handleConfirmarCancelarItem = async (numeroItem: number, motivo: string) => {
    const itemAlvo = itens.find((it) => it.item === numeroItem)
    if (!itemAlvo) return

    if (empresaAtiva?.id) {
      try {
        await registrarAuditoria({
          tabela: 'vendas_itens',
          registro_id: sessaoCaixa?.id || 'PDV',
          acao: 'CANCELAR_ITEM_PDV',
          empresa_id: empresaAtiva.id,
          valores_antes: {
            descricao: `Item #${numeroItem} (${itemAlvo.descricao}, Qtd: ${itemAlvo.quantidade}, Total: R$ ${itemAlvo.valor_total.toFixed(2)}) cancelado no PDV. Motivo: ${motivo}`,
            item: itemAlvo as unknown as Record<string, unknown>,
          },
        })
      } catch (err) {
        console.warn('Erro ao registrar auditoria de item cancelado:', err)
      }
    }

    const novosItens = itens
      .filter((it) => it.item !== numeroItem)
      .map((it, idx) => ({ ...it, item: idx + 1 }))

    setItens(novosItens)
    setMensagemStatus(`Item #${numeroItem} cancelado: ${itemAlvo.descricao}`)
    setTipoMensagemStatus('erro')
    focarLeitor()
  }

  // Alterar Quantidade do Último Item (F4)
  const handleConfirmarQtdItem = (novaQtd: number) => {
    if (itens.length === 0) return
    const ultimoIdx = itens.length - 1
    const atual = itens[ultimoIdx]
    const sub = atual.preco_unitario * novaQtd
    const desc = atual.desconto_valor
    const novoTot = Number(Math.max(0, sub - desc).toFixed(2))

    const atualizado: ItemCarrinhoPDV = {
      ...atual,
      quantidade: novaQtd,
      valor_total: novoTot,
    }

    const copia = [...itens]
    copia[ultimoIdx] = atualizado
    setItens(copia)
    setMensagemStatus(`Quantidade do item #${atual.item} alterada para ${novaQtd}`)
    setTipoMensagemStatus('sucesso')
    focarLeitor()
  }

  // Desconto no Item (F6)
  const handleConfirmarDescontoItem = (descontoValor: number, descontoPercentual: number) => {
    if (itens.length === 0) return
    const ultimoIdx = itens.length - 1
    const atual = itens[ultimoIdx]
    const sub = atual.preco_unitario * atual.quantidade
    const novoTot = Number(Math.max(0, sub - descontoValor).toFixed(2))

    const atualizado: ItemCarrinhoPDV = {
      ...atual,
      desconto_valor: descontoValor,
      desconto_percentual: descontoPercentual,
      valor_total: novoTot,
    }

    const copia = [...itens]
    copia[ultimoIdx] = atualizado
    setItens(copia)
    setMensagemStatus(`Desconto de R$ ${descontoValor.toFixed(2)} aplicado no item #${atual.item}`)
    setTipoMensagemStatus('sucesso')
    focarLeitor()
  }

  // Desconto no Total (F7)
  const handleConfirmarDescontoTotal = (descontoValor: number) => {
    setDescontoTotal(descontoValor)
    setMensagemStatus(`Desconto total de R$ ${descontoValor.toFixed(2)} aplicado na venda`)
    setTipoMensagemStatus('sucesso')
    focarLeitor()
  }

  // Alternar Tela Cheia
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullScreen(true))
        .catch(() => {})
    } else {
      if (document.exitFullscreen) {
        document
          .exitFullscreen()
          .then(() => setIsFullScreen(false))
          .catch(() => {})
      }
    }
  }

  // Concluir Venda (F10 - Confirmação do Modal de Pagamentos)
  const handleFinalizarVenda = async (
    pagamentos: Array<{
      forma_pagamento_id: string
      valor: number
      parcelas?: number
      bandeira?: string
      nsu?: string
      codigo_autorizacao?: string
      conta_financeira_id?: string
      condicao_pagamento_id?: string
    }>,
    troco: number,
  ) => {
    if (!empresaAtiva?.id) return
    if (!sessaoCaixa?.id) {
      throw new Error('Não há sessão de caixa aberta para registrar os pagamentos.')
    }
    if (!online) {
      throw new Error('PDV desconectado. Aguarde a conexão retornar para finalizar.')
    }

    // 1. Cria a venda pelo serviço central salvarVenda com payload PLANO
    // Cliente: o escolhido, senão o "Consumidor Final" do assinante (config),
    // senão resolve/cria na hora (evita o erro "Cliente é obrigatório").
    let clienteIdFinal = cliente?.id || configVendas?.cliente_padrao_id || ''
    if (!clienteIdFinal) {
      try {
        const consumidor = await obterOuCriarConsumidorFinal(usuarioERP?.assinante_id || undefined)
        clienteIdFinal = consumidor.id
        setConfigVendas((cfg) => (cfg ? { ...cfg, cliente_padrao_id: consumidor.id } : cfg))
      } catch (errCons) {
        console.warn('Não foi possível resolver o Consumidor Final do assinante:', errCons)
      }
    }
    if (!clienteIdFinal) {
      throw new Error('Cliente é obrigatório para registrar a venda.')
    }

    const inputSalvar: SalvarVendaInput = {
      empresa_id: empresaAtiva.id,
      tipo: 'PDV',
      cliente_id: clienteIdFinal,
      cpf_cnpj_consumidor: cpfCnpjCupom || undefined,
      vendedor_id: vendedor?.id || undefined,
      operador_id: usuarioERP?.id || undefined,
      pdv_terminal_id: sessaoCaixa?.pdv_terminal_id || terminalAtivo?.id || undefined,
      caixa_sessao_id: sessaoCaixa?.id,
      valor_desconto_total: descontoTotal,
      itens: itens.map((it) => ({
        produto_id: it.produto_id,
        item: it.item,
        descricao: it.descricao,
        unidade: it.unidade,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
        preco_tabela: it.preco_tabela,
        desconto_percentual: it.desconto_percentual,
        desconto_valor: it.desconto_valor,
        acrescimo_valor: it.acrescimo_valor,
        valor_total: it.valor_total,
        ncm: it.ncm,
        cest: it.cest,
        cfop: it.cfop,
      })),
    }

    const vendaSalva = await salvarVenda(inputSalvar)

    // 2. Chama finalizarVenda que dispara o hook /backend/v1/vendas/finalizar (baixa estoque, financeiro, caixa)
    const vendaFinalizada = await finalizarVenda({
      venda_id: vendaSalva.id,
      pagamentos: pagamentos.map((p) => ({
        forma_pagamento_id: p.forma_pagamento_id,
        valor: p.valor,
        parcelas: p.parcelas,
        bandeira: p.bandeira,
        nsu: p.nsu,
        codigo_autorizacao: p.codigo_autorizacao,
        conta_financeira_id: p.conta_financeira_id,
        condicao_pagamento_id: p.condicao_pagamento_id,
      })),
    })

    // 3. Emissão Fiscal de NFC-e ou Comprovante Não Fiscal
    const podeEmitirNfce =
      configFiscal &&
      configFiscal.emite_documentos_fiscais &&
      configFiscal.emite_nfce &&
      configFiscal.emitir_nfce_automaticamente_no_pdv

    let nfceAutorizada = false
    let nfceDanfeUrl = ''

    if (podeEmitirNfce) {
      if (!configFiscal.csc_configurado) {
        toast({
          title: 'Aviso Fiscal',
          description: 'CSC da NFC-e não configurado para esta loja.',
          variant: 'destructive',
        })
      } else {
        try {
          const respNfce = await emitirNFCeVenda({
            vendaId: vendaSalva.id,
          })

          if (respNfce.sucesso && respNfce.status === 'Autorizada') {
            nfceAutorizada = true
            nfceDanfeUrl = respNfce.danfe_url || ''
            toast({
              title: respNfce.contingencia ? 'NFC-e Emitida em Contingência!' : 'NFC-e Autorizada!',
              description: `Nota nº ${respNfce.numero || ''} autorizada com sucesso na SEFAZ.`,
            })
          } else {
            // Rejeição da SEFAZ ou erro interno do ERP (o hook distingue em erro_interno)
            setDadosRejeicaoNfce({
              vendaId: vendaSalva.id,
              numeroVenda: vendaFinalizada.numero || 0,
              motivo: respNfce.message || 'Rejeição na SEFAZ',
              erroInterno: respNfce.erro_interno === true,
            })
            setModalRejeicaoNfceAberto(true)
          }
        } catch (errNfce: any) {
          console.error('Erro ao emitir NFC-e no PDV:', errNfce)
          const msg = errNfce?.data?.message || errNfce?.message || 'Falha na emissão da NFC-e.'
          setDadosRejeicaoNfce({
            vendaId: vendaSalva.id,
            numeroVenda: vendaFinalizada.numero || 0,
            motivo: msg,
            erroInterno: true,
          })
          setModalRejeicaoNfceAberto(true)
        }
      }
    }

    // 4. Impressão: Se NFC-e autorizada, imprime o DANFCe (danfe_url) em bobina 80mm;
    // Se não autorizada, imprime o comprovante não fiscal com observação "NFC-e pendente".
    try {
      if (nfceAutorizada && nfceDanfeUrl) {
        imprimirDanfeUrl(nfceDanfeUrl)
      } else {
        let vendaImpressao: Venda = vendaSalva
        let itensImpressao: VendaItem[] = []
        let pagamentosImpressao: VendaPagamento[] = []

        try {
          const completa = await obterVendaCompleta(vendaSalva.id)
          vendaImpressao = completa.venda
          itensImpressao = completa.itens
          pagamentosImpressao = completa.pagamentos
        } catch {
          vendaImpressao = {
            ...vendaSalva,
            status: 'Finalizada',
            valor_troco: vendaFinalizada.valor_troco ?? troco,
            valor_total: vendaFinalizada.valor_total ?? vendaSalva.valor_total,
          }
          itensImpressao = itens.map((it) => ({
            id: it.tempId,
            venda_id: vendaSalva.id,
            item: it.item,
            produto_id: it.produto_id,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: it.quantidade,
            preco_unitario: it.preco_unitario,
            preco_tabela: it.preco_tabela,
            desconto_percentual: it.desconto_percentual,
            desconto_valor: it.desconto_valor,
            acrescimo_valor: it.acrescimo_valor,
            valor_total: it.valor_total,
            ativo: true,
          }))
          pagamentosImpressao = pagamentos.map((p, idx) => ({
            id: String(idx),
            venda_id: vendaSalva.id,
            forma_pagamento_id: p.forma_pagamento_id,
            valor: p.valor,
            parcelas: p.parcelas,
            bandeira: p.bandeira,
            nsu: p.nsu,
            codigo_autorizacao: p.codigo_autorizacao,
            conta_financeira_id: p.conta_financeira_id,
            ativo: true,
            expand: {
              forma_pagamento_id: formasPagamento.find((f) => f.id === p.forma_pagamento_id),
            },
          }))
        }

        const msgRodape = configFiscal?.emite_nfce
          ? `${configVendas?.mensagem_rodape_comprovante ? configVendas.mensagem_rodape_comprovante + ' | ' : ''}NFC-e pendente`
          : configVendas?.mensagem_rodape_comprovante || undefined

        const dadosImpressao: DadosImpressaoVenda = {
          venda: vendaImpressao,
          itens: itensImpressao,
          pagamentos: pagamentosImpressao,
          empresa: {
            razao_social: empresaAtiva.razao_social,
            nome_fantasia: empresaAtiva.nome_fantasia,
            cnpj: empresaAtiva.cnpj,
            telefone: empresaAtiva.telefone,
            email: empresaAtiva.email,
            logradouro: empresaAtiva.logradouro,
            numero: empresaAtiva.numero,
            bairro: empresaAtiva.bairro,
            cidade: empresaAtiva.municipio,
            uf: empresaAtiva.uf,
          },
          cliente: cliente
            ? {
                nome_razao_social: cliente.nome_razao_social,
                nome: cliente.nome_fantasia || cliente.nome_razao_social,
                cpf_cnpj: cliente.cpf_cnpj || cpfCnpjCupom,
                telefone: cliente.telefone,
                celular: cliente.celular,
                email: cliente.email,
                logradouro: cliente.logradouro,
                numero: cliente.numero,
                bairro: cliente.bairro,
                cidade: cliente.municipio,
                uf: cliente.uf,
              }
            : undefined,
          vendedorNome: vendedor?.nome || undefined,
          mensagemRodape: msgRodape,
        }

        imprimirComprovanteNaoFiscal(dadosImpressao)
      }
    } catch (errImp) {
      console.warn('Erro ao acionar impressão do cupom:', errImp)
    }

    // 4. Limpa estado e rascunho para a próxima venda
    setItens([])
    setDescontoTotal(0)
    setCliente(null)
    setCpfCnpjCupom('')
    setVendedor(null)
    limparRascunhoPDV()
    setModalPagamentoAberto(false)

    setMensagemStatus(
      `Venda #${vendaFinalizada.numero} finalizada com sucesso! Troco: R$ ${troco.toFixed(2)}`,
    )
    setTipoMensagemStatus('sucesso')

    toast({
      title: `Venda #${vendaFinalizada.numero} Finalizada!`,
      description: troco > 0 ? `Troco: R$ ${troco.toFixed(2)}` : 'Venda processada com sucesso.',
    })

    focarLeitor()
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      {/* 1) TOPO: EMPRESA, TERMINAL, OPERADOR, SESSÃO DE CAIXA E RELÓGIO */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-xl tracking-wider text-blue-400">PDV</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300">
              {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 border-l border-slate-800 pl-4">
            <span title="Terminal Atual">
              Terminal: <strong className="text-white">{terminalAtivo?.nome || 'PDV 01'}</strong>
            </span>
            <span className="text-slate-700">|</span>
            <span title="Operador">
              Operador: <strong className="text-white">{usuario?.nome || 'Caixa'}</strong>
            </span>
            <span className="text-slate-700">|</span>
            <span title="Sessão de Caixa">
              Caixa:{' '}
              {sessaoCaixa ? (
                <strong className="text-emerald-400">Aberto</strong>
              ) : (
                <button
                  type="button"
                  onClick={() => setModalAbrirCaixaAberto(true)}
                  className="text-amber-400 font-bold underline cursor-pointer"
                >
                  Abrir Caixa
                </button>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status de Rede */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {online ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <Wifi size={14} /> Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-400 animate-pulse font-bold">
                <WifiOff size={14} /> Offline
              </span>
            )}
          </div>

          {/* Relógio */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-md border border-slate-700 text-white font-mono text-sm font-bold shadow-inner">
            <Clock size={15} className="text-blue-400" />
            <span>{horaAtual}</span>
          </div>

          {/* Botão Tela Cheia */}
          <button
            type="button"
            onClick={toggleFullScreen}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Tela Cheia"
          >
            {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {/* Sair do PDV */}
          <button
            type="button"
            onClick={() => {
              if (itens.length > 0) {
                if (window.confirm('Existe uma venda em andamento. Deseja sair do PDV?')) {
                  navigate('/vendas/pedidos')
                }
              } else {
                navigate('/vendas/pedidos')
              }
            }}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 transition-colors"
          >
            Sair do PDV
          </button>
        </div>
      </header>

      {/* 2) CORPO PRINCIPAL DO PDV: ESQUERDA (ITENS) E DIREITA (TOTAL, CLIENTE, ATALHOS) */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* ESQUERDA: LISTA DE ITENS + ÚLTIMO ITEM EM DESTAQUE (7 COLUNAS) */}
        <section className="col-span-7 flex flex-col border-r border-slate-800 bg-slate-900/40 overflow-hidden">
          {/* Cabeçalho da Lista */}
          <div className="grid grid-cols-12 px-4 py-2.5 bg-slate-900 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <span className="col-span-1 text-center">Item</span>
            <span className="col-span-5">Descrição</span>
            <span className="col-span-2 text-right">Qtd x Preço</span>
            <span className="col-span-2 text-right">Desconto</span>
            <span className="col-span-2 text-right">Total (R$)</span>
          </div>

          {/* Lista Rolável de Itens */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-950/40">
            {itens.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                <ShoppingCart size={48} className="opacity-30 stroke-[1.5]" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-400">
                    Caixa Livre / Aguardando Itens
                  </p>
                  <p className="text-xs text-slate-500">
                    Passe o código de barras ou use F2 para buscar
                  </p>
                </div>
              </div>
            ) : (
              itens.map((it) => {
                const ehUltimo = ultimoItem?.tempId === it.tempId
                return (
                  <div
                    key={it.tempId}
                    className={`grid grid-cols-12 items-center px-3 py-2 rounded-lg text-xs transition-colors ${
                      ehUltimo
                        ? 'bg-blue-900/40 border border-blue-500/50 shadow-sm text-white font-medium'
                        : 'bg-slate-900/60 border border-slate-850 hover:bg-slate-850 text-slate-300'
                    }`}
                  >
                    <span className="col-span-1 text-center font-mono font-bold text-slate-400">
                      {String(it.item).padStart(2, '0')}
                    </span>
                    <div className="col-span-5 min-w-0 pr-2">
                      <div className="truncate font-semibold text-white text-[13px]">
                        {it.descricao}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>Cód: #{it.codigo}</span>
                        {it.eh_balanca && (
                          <span className="text-emerald-400 font-bold bg-emerald-950/60 px-1 rounded">
                            Balança
                          </span>
                        )}
                        <span>UN: {it.unidade}</span>
                      </div>
                    </div>
                    <div className="col-span-2 text-right font-mono">
                      <span>{it.quantidade}</span>
                      <span className="text-[11px] text-slate-400 block">
                        x R$ {it.preco_unitario.toFixed(2)}
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-mono text-amber-400">
                      {it.desconto_valor > 0 ? `- R$ ${it.desconto_valor.toFixed(2)}` : '—'}
                    </div>
                    <div className="col-span-2 text-right font-mono font-bold text-sm text-emerald-400">
                      R$ {it.valor_total.toFixed(2)}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={itensFimRef} />
          </div>

          {/* ÚLTIMO ITEM EM DESTAQUE (CARD INFERIOR COM FOTO) */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-4 shrink-0 min-h-[90px]">
            {ultimoItem ? (
              <>
                <div className="w-16 h-16 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                  {ultimoItem.foto ? (
                    <img
                      src={ultimoItem.foto}
                      alt={ultimoItem.descricao}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package size={28} className="text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500 text-white uppercase">
                      Último Item ({ultimoItem.item})
                    </span>
                    <span className="text-xs text-slate-400 font-mono">#{ultimoItem.codigo}</span>
                  </div>
                  <div className="text-sm font-bold text-white truncate mt-0.5">
                    {ultimoItem.descricao}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {ultimoItem.quantidade} {ultimoItem.unidade} x R${' '}
                    {ultimoItem.preco_unitario.toFixed(2)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block">
                    Subtotal
                  </span>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    R$ {ultimoItem.valor_total.toFixed(2)}
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full text-center text-xs text-slate-500 py-2">
                Nenhum item lançado até o momento.
              </div>
            )}
          </div>
        </section>

        {/* DIREITA: TOTAL, CLIENTE, VENDEDOR E PAINEL DE ATALHOS (5 COLUNAS) */}
        <section className="col-span-5 flex flex-col bg-slate-950 p-4 gap-3 overflow-hidden">
          {/* Quadro de Total Grande */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 uppercase font-bold tracking-wider">
              <span>Total a Pagar</span>
              <span>
                {itens.length} {itens.length === 1 ? 'item' : 'itens'} (
                {totalQuantidadeGeral.toFixed(2)} un)
              </span>
            </div>

            <div className="my-2 text-right">
              <div className="text-5xl font-black text-emerald-400 tracking-tight font-mono drop-shadow-md">
                R$ {totalVendaFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              {descontoTotal > 0 && (
                <div className="text-xs text-amber-400 font-mono mt-1 font-semibold">
                  Subtotal: R$ {subtotalItens.toFixed(2)} | Desconto Geral: - R${' '}
                  {descontoTotal.toFixed(2)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-300">
              <div
                onClick={() => setModalClienteAberto(true)}
                className="p-2 bg-slate-800/60 rounded-lg hover:bg-slate-800 cursor-pointer border border-slate-750 transition-colors"
                title="Clique ou pressione F3 para alterar o cliente"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase">
                  <User size={12} className="text-blue-400" />
                  <span>Cliente (F3)</span>
                </div>
                <div className="truncate font-bold text-white mt-0.5">
                  {cliente?.nome_razao_social || 'Consumidor Final'}
                </div>
                {cpfCnpjCupom && (
                  <div className="text-[10px] text-blue-300 font-mono truncate">
                    CPF/CNPJ: {cpfCnpjCupom}
                  </div>
                )}
              </div>

              <div
                onClick={() => setModalVendedorAberto(true)}
                className="p-2 bg-slate-800/60 rounded-lg hover:bg-slate-800 cursor-pointer border border-slate-750 transition-colors"
                title="Clique ou pressione F5 para alterar o vendedor"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase">
                  <UserCheck size={12} className="text-emerald-400" />
                  <span>Vendedor (F5)</span>
                </div>
                <div className="truncate font-bold text-white mt-0.5">
                  {vendedor?.nome || 'Balcão / Geral'}
                </div>
              </div>
            </div>
          </div>

          {/* CAMPO DE LEITURA PRINCIPAL (SEMPRE COM O FOCO) */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
            <label className="text-xs font-bold text-blue-400 uppercase tracking-wide flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5">
                <Barcode size={16} />
                Código de Barras / Ref / Qtd*Cód
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Ex: 3*7891000...</span>
            </label>
            <form onSubmit={handleProcessarLeitura} className="flex gap-2">
              <input
                ref={inputLeitorRef}
                type="text"
                value={entradaLeitor}
                onChange={(e) => setEntradaLeitor(e.target.value)}
                placeholder="Passe o leitor ou digite o código..."
                autoFocus
                className="flex-1 h-12 bg-slate-950 border-2 border-blue-500/80 focus:border-blue-400 rounded-lg px-3 text-lg font-mono font-bold text-white placeholder:text-slate-600 outline-none transition-all"
              />
              <button
                type="submit"
                className="h-12 px-5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-sm transition-colors shadow-lg shadow-blue-950/50"
              >
                Enter
              </button>
            </form>

            {/* Mensagem de Feedback da Leitura */}
            {mensagemStatus && (
              <div
                className={`mt-2 p-2 rounded text-xs flex items-center gap-1.5 transition-all ${
                  tipoMensagemStatus === 'erro'
                    ? 'bg-red-950/80 text-red-300 border border-red-800'
                    : tipoMensagemStatus === 'sucesso'
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-800 text-slate-300'
                }`}
              >
                {tipoMensagemStatus === 'erro' ? (
                  <AlertTriangle size={14} className="shrink-0 text-red-400" />
                ) : (
                  <CheckCircle size={14} className="shrink-0 text-emerald-400" />
                )}
                <span className="truncate">{mensagemStatus}</span>
              </div>
            )}
          </div>

          {/* PAINEL DE ATALHOS DE TECLADO (VISÍVEIS NA TELA) */}
          <div className="flex-1 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between overflow-hidden">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Atalhos de Operação (Teclado)
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setModalBuscaProdutoAberto(true)}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200"
              >
                <span className="font-semibold text-left">Buscar Produto</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-blue-900 text-blue-300 text-[10px]">
                  F2
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalClienteAberto(true)}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200"
              >
                <span className="font-semibold text-left">Cliente</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-blue-900 text-blue-300 text-[10px]">
                  F3
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalQtdItemAberto(true)}
                disabled={itens.length === 0}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200 disabled:opacity-40"
              >
                <span className="font-semibold text-left">Alterar Qtd Item</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px]">
                  F4
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalVendedorAberto(true)}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200"
              >
                <span className="font-semibold text-left">Vendedor</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-blue-900 text-blue-300 text-[10px]">
                  F5
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalDescontoItemAberto(true)}
                disabled={itens.length === 0}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200 disabled:opacity-40"
              >
                <span className="font-semibold text-left">Desconto Item</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 text-[10px]">
                  F6
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalDescontoTotalAberto(true)}
                disabled={itens.length === 0}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200 disabled:opacity-40"
              >
                <span className="font-semibold text-left">Desconto Total</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 text-[10px]">
                  F7
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModalCancelarItemAberto(true)}
                disabled={itens.length === 0}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200 disabled:opacity-40"
              >
                <span className="font-semibold text-left text-red-300">Cancelar Item</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 text-[10px]">
                  F8
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!sessaoCaixa) setModalAbrirCaixaAberto(true)
                  else setModalSangriaAberto(true)
                }}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700/60 text-slate-200"
              >
                <span className="font-semibold text-left">Sangria / Supr.</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px]">
                  F9
                </span>
              </button>
            </div>

            {/* BOTÕES GRANDES DE FINALIZAR E CANCELAR */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCancelarVendaEmAndamento}
                disabled={itens.length === 0}
                className="col-span-1 h-12 bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-30 transition-all"
              >
                <XCircle size={16} />
                <span>Cancelar (F12)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (itens.length === 0) {
                    toast({
                      title: 'Venda vazia',
                      description: 'Insira pelo menos um produto antes de finalizar.',
                      variant: 'destructive',
                    })
                    return
                  }
                  if (!sessaoCaixa) {
                    setModalAbrirCaixaAberto(true)
                    return
                  }
                  setModalPagamentoAberto(true)
                }}
                disabled={itens.length === 0 || !online}
                className="col-span-2 h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 disabled:opacity-30 transition-all"
              >
                <DollarSign size={18} />
                <span>FINALIZAR VENDA (F10)</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* MODAL DE PERGUNTA DE RASCUNHO PENDENTE */}
      {modalPerguntaRascunhoAberto && rascunhoPendente && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 text-white space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                <RotateCcw size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Venda em Andamento Recuperada</h3>
                <p className="text-xs text-slate-400">
                  Existe um rascunho com {rascunhoPendente.itens.length} itens salvo neste
                  navegador.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Deseja continuar atendendo a venda anterior ou prefere descartar e iniciar uma nova
              venda em branco?
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  limparRascunhoPDV()
                  setRascunhoPendente(null)
                  setModalPerguntaRascunhoAberto(false)
                  focarLeitor()
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
              >
                Descartar Rascunho
              </button>
              <button
                type="button"
                onClick={() => {
                  setItens(rascunhoPendente.itens)
                  setDescontoTotal(rascunhoPendente.desconto_total_valor || 0)
                  setCpfCnpjCupom(rascunhoPendente.cpf_cnpj_consumidor || '')
                  setModalPerguntaRascunhoAberto(false)
                  setMensagemStatus('Rascunho recuperado com sucesso.')
                  setTipoMensagemStatus('sucesso')
                  focarLeitor()
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold"
              >
                Continuar Venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PAGAMENTO (F10) */}
      {modalPagamentoAberto && (
        <ModalPagamentoPDV
          aberto={modalPagamentoAberto}
          onOpenChange={(ab) => {
            setModalPagamentoAberto(ab)
            if (!ab) focarLeitor()
          }}
          totalVenda={totalVendaFinal}
          cliente={cliente}
          formas={formasPagamento}
          contas={contasFinanceiras}
          condicoes={condicoesPagamento}
          contaPadraoCaixaId={terminalAtivo?.conta_financeira_id}
          empresaId={empresaAtiva?.id || ''}
          onConfirmar={handleFinalizarVenda}
        />
      )}

      {/* MODAL BUSCA PRODUTO (F2) */}
      {modalBuscaProdutoAberto && (
        <ModalBuscaProdutoPDV
          aberto={modalBuscaProdutoAberto}
          onOpenChange={(ab) => {
            setModalBuscaProdutoAberto(ab)
            if (!ab) focarLeitor()
          }}
          produtos={produtosCatalogo}
          onSelecionar={(p, qtd) => {
            adicionarProdutoAoCarrinho(p, qtd)
          }}
        />
      )}

      {/* MODAL CLIENTE (F3) */}
      {modalClienteAberto && (
        <ModalClientePDV
          aberto={modalClienteAberto}
          onOpenChange={(ab) => {
            setModalClienteAberto(ab)
            if (!ab) focarLeitor()
          }}
          clienteAtual={cliente}
          cpfCnpjAtual={cpfCnpjCupom}
          onConfirmar={(c, cpf) => {
            setCliente(c)
            setCpfCnpjCupom(cpf)
            focarLeitor()
          }}
        />
      )}

      {/* MODAL VENDEDOR (F5) */}
      {modalVendedorAberto && (
        <ModalVendedorPDV
          aberto={modalVendedorAberto}
          onOpenChange={(ab) => {
            setModalVendedorAberto(ab)
            if (!ab) focarLeitor()
          }}
          vendedorAtualId={vendedor?.id}
          empresaId={empresaAtiva?.id || ''}
          onConfirmar={(v) => {
            setVendedor(v)
            focarLeitor()
          }}
        />
      )}

      {/* MODAL ALTERAR QTD ÚLTIMO ITEM (F4) */}
      {modalQtdItemAberto && ultimoItem && (
        <ModalQuantidadeItemPDV
          aberto={modalQtdItemAberto}
          onOpenChange={(ab) => {
            setModalQtdItemAberto(ab)
            if (!ab) focarLeitor()
          }}
          itemDescricao={ultimoItem.descricao}
          quantidadeAtual={ultimoItem.quantidade}
          onConfirmar={handleConfirmarQtdItem}
        />
      )}

      {/* MODAL DESCONTO ITEM (F6) */}
      {modalDescontoItemAberto && ultimoItem && (
        <ModalDescontoItemPDV
          aberto={modalDescontoItemAberto}
          onOpenChange={(ab) => {
            setModalDescontoItemAberto(ab)
            if (!ab) focarLeitor()
          }}
          itemDescricao={ultimoItem.descricao}
          valorTotalItem={ultimoItem.valor_total}
          precoUnitario={ultimoItem.preco_unitario}
          quantidade={ultimoItem.quantidade}
          onConfirmar={handleConfirmarDescontoItem}
        />
      )}

      {/* MODAL DESCONTO TOTAL (F7) */}
      {modalDescontoTotalAberto && (
        <ModalDescontoTotalPDV
          aberto={modalDescontoTotalAberto}
          onOpenChange={(ab) => {
            setModalDescontoTotalAberto(ab)
            if (!ab) focarLeitor()
          }}
          subtotalVenda={subtotalItens}
          descontoAtual={descontoTotal}
          onConfirmar={handleConfirmarDescontoTotal}
        />
      )}

      {/* MODAL CANCELAR ITEM (F8) */}
      {modalCancelarItemAberto && (
        <ModalCancelarItemPDV
          aberto={modalCancelarItemAberto}
          onOpenChange={(ab) => {
            setModalCancelarItemAberto(ab)
            if (!ab) focarLeitor()
          }}
          totalItens={itens.length}
          onConfirmar={handleConfirmarCancelarItem}
        />
      )}

      {/* MODAL ABRIR CAIXA */}
      {modalAbrirCaixaAberto && empresaAtiva?.id && (
        <ModalAbrirCaixa
          open={modalAbrirCaixaAberto}
          onOpenChange={setModalAbrirCaixaAberto}
          empresaId={empresaAtiva.id}
          onSucesso={() => {
            setModalAbrirCaixaAberto(false)
            carregarDadosIniciais()
            focarLeitor()
          }}
        />
      )}

      {/* MODAL SANGRIA (F9) */}
      {modalSangriaAberto && sessaoCaixa && (
        <ModalSangria
          open={modalSangriaAberto}
          onOpenChange={setModalSangriaAberto}
          sessao={sessaoCaixa}
          empresaNome={empresaAtiva?.razao_social || ''}
          onSucesso={() => {
            setModalSangriaAberto(false)
            carregarDadosIniciais()
            focarLeitor()
          }}
        />
      )}

      {/* MODAL SUPRIMENTO */}
      {modalSuprimentoAberto && sessaoCaixa && (
        <ModalSuprimento
          open={modalSuprimentoAberto}
          onOpenChange={setModalSuprimentoAberto}
          sessao={sessaoCaixa}
          onSucesso={() => {
            setModalSuprimentoAberto(false)
            carregarDadosIniciais()
            focarLeitor()
          }}
        />
      )}

      {/* MODAL AVISO DE REJEIÇÃO NFC-E (PDV) */}
      {modalRejeicaoNfceAberto && dadosRejeicaoNfce && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-600/60 rounded-xl max-w-lg w-full p-6 text-white space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
                <AlertTriangle size={26} />
              </div>
              <div className="flex-1 min-w-0">
                {dadosRejeicaoNfce.erroInterno ? (
                  <>
                    <h3 className="text-base font-bold text-red-300">Erro interno do ERP</h3>
                    <p className="text-xs text-slate-300 mt-1">
                      A venda #{dadosRejeicaoNfce.numeroVenda} foi concluída com sucesso no caixa,
                      mas houve uma falha interna na emissão da nota (não chegou à SEFAZ).
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-bold text-amber-300">
                      NFC-e Rejeitada pela SEFAZ
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      A venda #{dadosRejeicaoNfce.numeroVenda} foi concluída com sucesso no caixa,
                      mas a emissão da nota fiscal foi rejeitada pela SEFAZ.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs font-mono text-amber-200 break-words leading-relaxed max-h-36 overflow-y-auto">
              <span className="text-slate-400 font-sans block mb-1 font-bold">
                Motivo retornado:
              </span>
              {dadosRejeicaoNfce.motivo}
            </div>

            <p className="text-xs text-slate-400">
              Você pode tentar reenviar a mesma nota agora ou fechar este aviso para continuar
              atendendo os clientes. A venda ficará com status "Rejeitada" no monitor fiscal.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setModalRejeicaoNfceAberto(false)
                  setDadosRejeicaoNfce(null)
                  focarLeitor()
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Seguir Vendendo (Fechar)
              </button>

              <button
                type="button"
                disabled={reemitindoNfce}
                onClick={async () => {
                  if (!dadosRejeicaoNfce?.vendaId) return
                  setReemitindoNfce(true)
                  try {
                    const resp = await emitirNFCeVenda({
                      vendaId: dadosRejeicaoNfce.vendaId,
                    })
                    if (resp.sucesso && resp.status === 'Autorizada') {
                      toast({
                        title: 'NFC-e Autorizada!',
                        description: `Nota autorizada com sucesso na SEFAZ.`,
                      })
                      if (resp.danfe_url) {
                        imprimirDanfeUrl(resp.danfe_url)
                      }
                      setModalRejeicaoNfceAberto(false)
                      setDadosRejeicaoNfce(null)
                      focarLeitor()
                    } else {
                      setDadosRejeicaoNfce((prev) =>
                        prev
                          ? {
                              ...prev,
                              motivo: resp.message || 'Falha na reemissão',
                              erroInterno: resp.erro_interno === true,
                            }
                          : null,
                      )
                      toast({
                        title: resp.erro_interno ? 'Erro interno do ERP' : 'Tentativa Rejeitada',
                        description: resp.message || 'Verifique o cadastro fiscal.',
                        variant: 'destructive',
                      })
                    }
                  } catch (errRetry: any) {
                    const msg = errRetry?.data?.message || errRetry?.message || 'Falha na conexão.'
                    setDadosRejeicaoNfce((prev) =>
                      prev ? { ...prev, motivo: msg, erroInterno: true } : null,
                    )
                    toast({
                      title: 'Erro ao tentar de novo',
                      description: msg,
                      variant: 'destructive',
                    })
                  } finally {
                    setReemitindoNfce(false)
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={14} className={reemitindoNfce ? 'animate-spin' : ''} />
                <span>{reemitindoNfce ? 'Transmitindo...' : 'Tentar de novo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default PdvPage
