import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileText,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  Send,
  Copy,
  ArrowRightCircle,
  Ban,
  CheckCircle2,
  ShieldCheck,
  UserPlus,
  AlertCircle,
  Info,
  Calendar,
  DollarSign,
  TrendingUp,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  salvarVenda,
  obterVendaCompleta,
  duplicarVenda,
  converterOrcamentoEmPedido,
  Venda,
  ItemVendaInput,
  TipoVenda,
  StatusVenda,
} from '@/services/vendas'
import { emitirNFCeVenda, imprimirDanfeUrl } from '@/services/fiscalIntegracao'
import { obterDocumentoFiscalPorId } from '@/services/documentosFiscais'
import { obterConfigFiscalEmpresa, ConfigEmissaoFiscal } from '@/services/configEmissaoFiscal'
import {
  imprimirOrcamentoOuPedido,
  imprimirComprovanteNaoFiscal,
  abrirEnvioWhatsApp,
} from '@/services/vendasImpressao'
import { obterClientePorId, listarVendedoresAtivos, Cliente } from '@/services/clientes'
import { obterProdutoPorId, Produto } from '@/services/produtos'
import { obterSaldoAtual } from '@/services/estoque'
import { creditoCliente, SituacaoCreditoCliente } from '@/services/contasReceber'
import { obterOuCriarConfigVendasEmpresa } from '@/services/configVendas'
import { validarDescontoItem } from '@/services/descontos'
import SelectCliente from '@/components/SelectCliente'
import { ClienteCadastroRapido } from '@/components/ClienteCadastroRapido'
import SelectProduto from '@/components/SelectProduto'
import BuscaProdutoGtin from '@/components/BuscaProdutoGtin'
import SelectCondicaoPagamento from '@/components/SelectCondicaoPagamento'
import { ModalAutorizacaoSupervisor } from '@/components/ModalAutorizacaoSupervisor'
import { ModalFinalizarVenda } from './ModalFinalizarVenda'
import { ModalCancelarVenda } from './ModalCancelarVenda'
import { ModalPrevisualizarNota } from '@/components/fiscal/ModalPrevisualizarNota'
import { ModalEmitirNFe } from '@/components/fiscal/ModalEmitirNFe'
import { ModalCancelarNFe } from '@/components/fiscal/ModalCancelarNFe'
import { ModalCartaCorrecao } from '@/components/fiscal/ModalCartaCorrecao'
import { ModalEnviarEmailNFe } from '@/components/fiscal/ModalEnviarEmailNFe'
import { consultarSituacaoNFe } from '@/services/fiscalIntegracao'
import {
  montarDocumentoFiscal,
  ResultadoPrevisualizacaoNota,
  obterDocumentoFiscalDaVenda,
} from '@/services/documentosFiscais'
import { Mail, RefreshCw } from 'lucide-react'

interface LinhaItemForm extends ItemVendaInput {
  tempId: string
  produtoRef?: Produto
  saldoEstoque?: number
}

export const VendaFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, usuarioERP } = usePermissoes()

  const ehEdicao = Boolean(id && id !== 'novo')
  const podeEditar = pode('vendas', 'editar') || pode('vendas', 'criar')
  const podeExcluir = pode('vendas', 'excluir')
  const podeVerMargem = pode('produtos', 'editar')
  const podeEmitirFiscal = pode('notas_saida', 'criar') || pode('notas_saida', 'editar')

  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Registro original da venda carregada (se edição)
  const [vendaAtual, setVendaAtual] = useState<Venda | null>(null)
  const [configFiscal, setConfigFiscal] = useState<ConfigEmissaoFiscal | null>(null)
  const [danfeUrlNota, setDanfeUrlNota] = useState<string>('')
  const [emitindoNfceManual, setEmitindoNfceManual] = useState<boolean>(false)

  // Cabeçalho da Venda
  const [numero, setNumero] = useState<number>(0)
  const [tipo, setTipo] = useState<TipoVenda>('Pedido')
  const [status, setStatus] = useState<StatusVenda>('Pedido em aberto')
  const [clienteId, setClienteId] = useState<string>('')
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [cpfCnpjConsumidor, setCpfCnpjConsumidor] = useState<string>('')
  const [vendedorId, setVendedorId] = useState<string>('')
  const [dataEmissao, setDataEmissao] = useState<string>(new Date().toISOString().slice(0, 10))
  const [dataValidade, setDataValidade] = useState<string>('')
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState<string>('')
  const [observacao, setObservacao] = useState<string>('')
  const [observacaoCliente, setObservacaoCliente] = useState<string>('')

  // Rodapé: Frete, Acréscimo, Desconto Total
  const [valorFrete, setValorFrete] = useState<number>(0)
  const [valorAcrescimo, setValorAcrescimo] = useState<number>(0)
  const [valorDescontoTotal, setValorDescontoTotal] = useState<number>(0)

  // Itens da Venda
  const [itens, setItens] = useState<LinhaItemForm[]>([])

  // Quadro de Crédito do Cliente
  const [credito, setCredito] = useState<SituacaoCreditoCliente | null>(null)
  const [carregandoCredito, setCarregandoCredito] = useState(false)

  // Vendedores ativos
  const [vendedores, setVendedores] = useState<Array<{ id: string; nome: string }>>([])

  // Modais auxiliares
  const [modalClienteRapidoAberto, setModalClienteRapidoAberto] = useState(false)
  const [modalFinalizarAberto, setModalFinalizarAberto] = useState(false)
  const [modalCancelarAberto, setModalCancelarAberto] = useState(false)
  const [modalPrevisualizarNotaAberto, setModalPrevisualizarNotaAberto] = useState(false)
  const [carregandoPrevisualizacao, setCarregandoPrevisualizacao] = useState(false)
  const [dadosPrevisualizacao, setDadosPrevisualizacao] =
    useState<ResultadoPrevisualizacaoNota | null>(null)
  const [erroPrevisualizacao, setErroPrevisualizacao] = useState<string | null>(null)

  // Modais de NF-e (Modelo 55)
  const [modalEmitirNFeAberto, setModalEmitirNFeAberto] = useState(false)
  const [modalCancelarNFeAberto, setModalCancelarNFeAberto] = useState(false)
  const [modalCartaCorrecaoAberto, setModalCartaCorrecaoAberto] = useState(false)
  const [modalEnviarEmailNFeAberto, setModalEnviarEmailNFeAberto] = useState(false)
  const [docFiscalNFe, setDocFiscalNFe] = useState<any>(null)
  const [consultandoSituacaoNFe, setConsultandoSituacaoNFe] = useState(false)

  // Modal Autorização de Supervisor para desconto
  const [modalSupervisorAberto, setModalSupervisorAberto] = useState(false)
  const [itemParaAutorizar, setItemParaAutorizar] = useState<{
    tempId: string
    descontoPercentual: number
    produtoNome: string
    produtoId: string
  } | null>(null)

  // Carregar Vendedores
  useEffect(() => {
    listarVendedoresAtivos()
      .then(setVendedores)
      .catch(() => {})
  }, [])

  // Carregar dados da Venda se edição
  useEffect(() => {
    if (!ehEdicao || !id) return

    setCarregando(true)
    setErro(null)

    obterVendaCompleta(id)
      .then(async ({ venda, itens: itensRes }) => {
        setVendaAtual(venda)
        setNumero(venda.numero)
        setTipo(venda.tipo)
        setStatus(venda.status)
        setClienteId(venda.cliente_id)
        setCpfCnpjConsumidor(venda.cpf_cnpj_consumidor || '')
        setVendedorId(venda.vendedor_id || '')
        setDataEmissao(venda.data_emissao || new Date().toISOString().slice(0, 10))
        setDataValidade(venda.data_validade || '')
        setCondicaoPagamentoId(venda.condicao_pagamento_id || '')
        setObservacao(venda.observacao || '')
        setObservacaoCliente(venda.observacao_cliente || '')
        setValorFrete(Number(venda.valor_frete || 0))
        setValorAcrescimo(Number(venda.valor_acrescimo || 0))
        setValorDescontoTotal(Number(venda.valor_desconto_total || 0))

        // Mapear itens com saldo de estoque atual
        const itensCarregados: LinhaItemForm[] = await Promise.all(
          itensRes.map(async (it) => {
            let saldo = 0
            try {
              if (it.produto_id && empresaAtiva?.id) {
                const s = await obterSaldoAtual(empresaAtiva.id, it.produto_id)
                saldo = s?.quantidade || 0
              }
            } catch {
              /* intentionally ignored */
            }

            return {
              tempId: Math.random().toString(),
              id: it.id,
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
              custo_unitario: it.custo_unitario,
              ncm: it.ncm,
              cest: it.cest,
              cfop: it.cfop,
              origem: it.origem,
              cst_icms: it.cst_icms,
              csosn: it.csosn,
              aliquota_icms: it.aliquota_icms,
              cst_pis: it.cst_pis,
              cst_cofins: it.cst_cofins,
              perfil_tributario_id: it.perfil_tributario_id,
              saldoEstoque: saldo,
            }
          }),
        )

        setItens(itensCarregados)

        // Buscar dados do cliente
        if (venda.cliente_id) {
          obterClientePorId(venda.cliente_id)
            .then(setClienteSelecionado)
            .catch(() => {})
        }

        // Buscar documento fiscal e danfe_url se já existir
        if (venda.documento_fiscal_id) {
          obterDocumentoFiscalPorId(venda.documento_fiscal_id)
            .then((doc) => {
              if (doc?.danfe_url) {
                setDanfeUrlNota(doc.danfe_url)
              }
            })
            .catch(() => {})
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar venda:', err)
        setErro('Falha ao buscar os dados da venda solicitada.')
      })
      .finally(() => {
        setCarregando(false)
      })
  }, [ehEdicao, id])

  // Carregar Config Fiscal da Empresa
  useEffect(() => {
    if (!empresaAtiva?.id) return
    obterConfigFiscalEmpresa(empresaAtiva.id)
      .then(setConfigFiscal)
      .catch(() => {})
  }, [empresaAtiva?.id])

  // Inicialização para Nova Venda (defaults da config de vendas)
  useEffect(() => {
    if (ehEdicao || !empresaAtiva?.id) return

    obterOuCriarConfigVendasEmpresa(empresaAtiva.id)
      .then((cfg) => {
        if (cfg.validade_orcamento_dias) {
          const dt = new Date()
          dt.setDate(dt.getDate() + cfg.validade_orcamento_dias)
          setDataValidade(dt.toISOString().slice(0, 10))
        }

        // Vendedor padrão: usuário logado se for vendedor
        if (usuarioERP && usuarioERP.e_vendedor) {
          setVendedorId(usuarioERP.id)
        }

        // Cliente padrão
        if (cfg.cliente_padrao_id && !clienteId) {
          setClienteId(cfg.cliente_padrao_id)
          obterClientePorId(cfg.cliente_padrao_id)
            .then((cli) => {
              setClienteSelecionado(cli)
              if (cli.vendedor_id && (!usuarioERP || !usuarioERP.e_vendedor)) {
                setVendedorId(cli.vendedor_id)
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [ehEdicao, empresaAtiva?.id, usuarioERP])

  // Carregar limites e saldo do Cliente quando selecionado
  useEffect(() => {
    if (!clienteId || !empresaAtiva?.id) {
      setCredito(null)
      return
    }

    setCarregandoCredito(true)
    creditoCliente(clienteId, empresaAtiva.id)
      .then((cr) => {
        setCredito(cr)
      })
      .catch(() => {
        setCredito(null)
      })
      .finally(() => {
        setCarregandoCredito(false)
      })
  }, [clienteId, empresaAtiva?.id])

  // Ao selecionar um cliente
  const handleSelecionarCliente = (novoClienteId: string, cliObj?: Cliente) => {
    setClienteId(novoClienteId)
    setClienteSelecionado(cliObj || null)

    if (cliObj) {
      // Define vendedor padrão do cliente se existir
      if (cliObj.vendedor_id) {
        setVendedorId(cliObj.vendedor_id)
      }
      // Define condição padrão do cliente se existir
      if (cliObj.condicao_pagamento_id) {
        setCondicaoPagamentoId(cliObj.condicao_pagamento_id)
      }
    }
  }

  // Cálculos de Totais
  const subtotalProdutos = useMemo(() => {
    return itens.reduce(
      (acc, it) => acc + (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0),
      0,
    )
  }, [itens])

  const totalDescontoItens = useMemo(() => {
    return itens.reduce((acc, it) => acc + (Number(it.desconto_valor) || 0), 0)
  }, [itens])

  const totalGeralCalculado = useMemo(() => {
    const total =
      subtotalProdutos -
      totalDescontoItens -
      Number(valorDescontoTotal || 0) +
      Number(valorAcrescimo || 0) +
      Number(valorFrete || 0)
    return Math.max(0, Math.round(total * 100) / 100)
  }, [subtotalProdutos, totalDescontoItens, valorDescontoTotal, valorAcrescimo, valorFrete])

  // Custo Total e Margem Estimada
  const custoTotalCalculado = useMemo(() => {
    return itens.reduce((acc, it) => {
      const custo = Number(it.custo_unitario || 0)
      const qtd = Number(it.quantidade || 0)
      return acc + custo * qtd
    }, 0)
  }, [itens])

  const margemEstimada = useMemo(() => {
    if (totalGeralCalculado <= 0) return { lucro: 0, percentual: 0 }
    const lucro = totalGeralCalculado - custoTotalCalculado
    const percentual = (lucro / totalGeralCalculado) * 100
    return { lucro, percentual }
  }, [totalGeralCalculado, custoTotalCalculado])

  // Manipulação de Itens
  const handleAdicionarProduto = async (prod: Produto) => {
    let saldo = 0
    try {
      if (empresaAtiva?.id) {
        const s = await obterSaldoAtual(empresaAtiva.id, prod.id)
        saldo = s?.quantidade || 0
      }
    } catch {
      /* intentionally ignored */
    }

    const precoVenda = Number(prod.preco_venda || 0)
    const novoItem: LinhaItemForm = {
      tempId: Math.random().toString(),
      item: itens.length + 1,
      produto_id: prod.id,
      descricao: prod.descricao,
      unidade: (prod.expand as any)?.unidade_id?.sigla || 'UN',
      quantidade: 1,
      preco_unitario: precoVenda,
      preco_tabela: precoVenda,
      desconto_percentual: 0,
      desconto_valor: 0,
      acrescimo_valor: 0,
      valor_total: precoVenda,
      custo_unitario: Number(prod.preco_custo || 0),
      ncm: prod.ncm || '',
      cest: prod.cest || '',
      cfop: prod.cfop_venda_interna || '',
      origem: prod.origem || '0',
      cst_icms: prod.cst_icms || '',
      csosn: prod.csosn || '',
      aliquota_icms: Number(prod.aliquota_icms || 0),
      perfil_tributario_id: prod.perfil_tributario_id || '',
      saldoEstoque: saldo,
      produtoRef: prod,
    }

    setItens((prev) => [...prev, novoItem])
  }

  const handleRemoverItem = (tempId: string) => {
    setItens((prev) => prev.filter((it) => it.tempId !== tempId))
  }

  const handleAtualizarItem = (tempId: string, campo: keyof LinhaItemForm, valor: any) => {
    setItens((prev) =>
      prev.map((it) => {
        if (it.tempId !== tempId) return it
        const atual = { ...it, [campo]: valor }

        const qtd = Number(atual.quantidade) || 0
        const preco = Number(atual.preco_unitario) || 0
        const subtotal = qtd * preco

        // Se alterou desconto percentual, recalcula valor
        if (campo === 'desconto_percentual') {
          const pct = Math.min(100, Math.max(0, Number(valor) || 0))
          atual.desconto_percentual = pct
          atual.desconto_valor = Math.round(subtotal * (pct / 100) * 100) / 100
        }
        // Se alterou desconto valor, recalcula percentual
        else if (campo === 'desconto_valor') {
          const descV = Math.min(subtotal, Math.max(0, Number(valor) || 0))
          atual.desconto_valor = descV
          atual.desconto_percentual = subtotal > 0 ? (descV / subtotal) * 100 : 0
        }
        // Se alterou quantidade ou preço unitário, atualiza desconto em valor mantendo o percentual
        else if (campo === 'quantidade' || campo === 'preco_unitario') {
          const pct = Number(atual.desconto_percentual) || 0
          atual.desconto_valor = Math.round(subtotal * (pct / 100) * 100) / 100
        }

        const desc = Number(atual.desconto_valor) || 0
        const acresc = Number(atual.acrescimo_valor) || 0
        atual.valor_total = Math.max(0, Math.round((subtotal - desc + acresc) * 100) / 100)

        return atual
      }),
    )
  }

  // Validação de Desconto e Autorização de Supervisor
  const handleValidarDescontoItem = async (it: LinhaItemForm) => {
    if (!it.produtoRef) {
      try {
        it.produtoRef = await obterProdutoPorId(it.produto_id)
      } catch {
        /* intentionally ignored */
      }
    }

    const resultado = validarDescontoItem({
      usuario: usuarioERP || {},
      produto: it.produtoRef,
      descontoPercentual: Number(it.desconto_percentual) || 0,
    })

    if (!resultado.valido) {
      setItemParaAutorizar({
        tempId: it.tempId,
        descontoPercentual: Number(it.desconto_percentual) || 0,
        produtoNome: it.descricao,
        produtoId: it.produto_id,
      })
      setModalSupervisorAberto(true)
    }
  }

  // Salvar Venda (Orçamento ou Pedido)
  const handleSalvar = async (tipoDestino?: TipoVenda) => {
    setErro(null)

    if (!empresaAtiva?.id) {
      setErro('Nenhuma empresa ativa selecionada.')
      return
    }

    if (!clienteId) {
      setErro('Por favor, selecione ou cadastre um cliente.')
      return
    }

    if (itens.length === 0) {
      setErro('Adicione pelo menos um item à venda.')
      return
    }

    const tipoFinal = tipoDestino || tipo

    setSalvando(true)
    try {
      const salva = await salvarVenda({
        id: ehEdicao ? id : undefined,
        empresa_id: empresaAtiva.id,
        tipo: tipoFinal,
        cliente_id: clienteId,
        cpf_cnpj_consumidor: cpfCnpjConsumidor || undefined,
        vendedor_id: vendedorId || undefined,
        operador_id: usuarioERP?.id || undefined,
        data_emissao: dataEmissao,
        data_validade: dataValidade || undefined,
        valor_frete: Number(valorFrete) || 0,
        valor_acrescimo: Number(valorAcrescimo) || 0,
        valor_desconto_total: Number(valorDescontoTotal) || 0,
        condicao_pagamento_id: condicaoPagamentoId || undefined,
        observacao,
        observacao_cliente: observacaoCliente,
        itens: itens.map((it, idx) => ({
          item: idx + 1,
          produto_id: it.produto_id,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: Number(it.quantidade) || 1,
          preco_unitario: Number(it.preco_unitario) || 0,
          preco_tabela: Number(it.preco_tabela) || Number(it.preco_unitario) || 0,
          desconto_percentual: Number(it.desconto_percentual) || 0,
          desconto_valor: Number(it.desconto_valor) || 0,
          acrescimo_valor: Number(it.acrescimo_valor) || 0,
          valor_total: Number(it.valor_total) || 0,
          custo_unitario: Number(it.custo_unitario) || 0,
          ncm: it.ncm,
          cest: it.cest,
          cfop: it.cfop,
          origem: it.origem,
          cst_icms: it.cst_icms,
          csosn: it.csosn,
          aliquota_icms: it.aliquota_icms,
          perfil_tributario_id: it.perfil_tributario_id,
        })),
      })

      toast({
        title: `${tipoFinal} salvo com sucesso!`,
        description: `Venda #${salva.numero} gravada no sistema.`,
      })

      if (!ehEdicao) {
        navigate(`/vendas/pedidos/${salva.id}`)
      } else {
        setVendaAtual(salva)
        setTipo(salva.tipo)
        setStatus(salva.status)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar a venda.'
      setErro(msg)
      toast({
        title: 'Erro ao salvar',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Ações Comerciais
  const handleImprimir = async () => {
    if (!vendaAtual) return
    try {
      const { venda, itens: its, pagamentos } = await obterVendaCompleta(vendaAtual.id)
      if (venda.status === 'Finalizada') {
        imprimirComprovanteNaoFiscal({
          venda,
          itens: its,
          pagamentos,
          empresa: empresaAtiva || {},
          cliente: clienteSelecionado || undefined,
          vendedorNome: vendedores.find((v) => v.id === vendedorId)?.nome,
        })
      } else {
        imprimirOrcamentoOuPedido({
          venda,
          itens: its,
          empresa: empresaAtiva || {},
          cliente: clienteSelecionado || undefined,
          vendedorNome: vendedores.find((v) => v.id === vendedorId)?.nome,
        })
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Falha ao preparar impressão.',
        variant: 'destructive',
      })
    }
  }

  const handleWhatsApp = () => {
    if (!vendaAtual) return
    const tel = clienteSelecionado?.celular || clienteSelecionado?.telefone
    abrirEnvioWhatsApp({
      telefone: tel,
      numeroVenda: vendaAtual.numero,
      tipo: vendaAtual.tipo,
      clienteNome: clienteSelecionado?.nome_razao_social || clienteSelecionado?.nome,
      valorTotal: totalGeralCalculado,
      empresaNome: empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social,
      dataValidade: dataValidade || undefined,
    })
  }

  const handleDuplicar = async () => {
    if (!vendaAtual) return
    try {
      setSalvando(true)
      const nova = await duplicarVenda(vendaAtual.id, tipo === 'Orçamento' ? 'Orçamento' : 'Pedido')
      toast({
        title: 'Venda duplicada',
        description: `Novo registro #${nova.numero} gerado a partir da venda #${vendaAtual.numero}.`,
      })
      navigate(`/vendas/pedidos/${nova.id}`)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao duplicar',
        description: err instanceof Error ? err.message : 'Falha ao duplicar venda.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleConverterPedido = async () => {
    if (!vendaAtual) return
    try {
      const convertida = await converterOrcamentoEmPedido(vendaAtual.id)
      setVendaAtual(convertida)
      setTipo('Pedido')
      setStatus('Pedido em aberto')
      toast({
        title: 'Orçamento convertido',
        description: `Orçamento #${convertida.numero} convertido para Pedido em aberto.`,
      })
    } catch (err: unknown) {
      toast({
        title: 'Erro ao converter',
        description: err instanceof Error ? err.message : 'Falha na conversão.',
        variant: 'destructive',
      })
    }
  }

  const ehFinalizada = status === 'Finalizada'
  const ehCancelada = status === 'Cancelada'
  const formularioBloqueado = ehFinalizada || ehCancelada
  const docFiscalStatus = vendaAtual?.documento_fiscal_status
  const temNfceAutorizada = docFiscalStatus === 'Autorizada' && docFiscalNFe?.modelo === '65'
  const statusFiscalStr = String(docFiscalStatus || '')
  const temNfeAutorizada =
    statusFiscalStr === 'Autorizada' &&
    (docFiscalNFe?.modelo === '55' || (!docFiscalNFe && vendaAtual?.tipo === 'Pedido'))
  const nfeEmProcessamento = statusFiscalStr === 'Processando'

  // Regra: pode emitir NF-e se a venda estiver Finalizada, tiver permissão criar/editar em notas_saida
  // e não possuir NFC-e autorizada nem NF-e autorizada (salvo se cancelada)
  const podeEmitirNFe =
    ehFinalizada &&
    podeEmitirFiscal &&
    (!docFiscalStatus ||
      statusFiscalStr === 'Não emitido' ||
      statusFiscalStr === 'Não emitida' ||
      statusFiscalStr === 'Rejeitada' ||
      statusFiscalStr === 'Cancelada')

  const podeEmitirNfceManual =
    ehFinalizada &&
    configFiscal?.emite_documentos_fiscais &&
    configFiscal?.emite_nfce &&
    (!docFiscalStatus ||
      docFiscalStatus === 'Não emitido' ||
      (docFiscalStatus as any) === 'Não emitida' ||
      docFiscalStatus === 'Rejeitada') &&
    podeEmitirFiscal

  // Carregar documento fiscal NFe associado à venda
  const recarregarDocumentoFiscal = async () => {
    if (!vendaAtual?.id) return
    try {
      const doc = await obterDocumentoFiscalDaVenda(vendaAtual.id, '55')
      setDocFiscalNFe(doc)
      if (doc?.danfe_url) {
        setDanfeUrlNota(doc.danfe_url)
      }
    } catch {
      /* intentionally ignored */
    }
  }

  useEffect(() => {
    if (vendaAtual?.id) {
      recarregarDocumentoFiscal()
    }
  }, [vendaAtual?.id, vendaAtual?.documento_fiscal_status])

  const handleConsultarSituacaoNFe = async () => {
    if (!vendaAtual?.id) return
    try {
      setConsultandoSituacaoNFe(true)
      const res = await consultarSituacaoNFe({
        venda_id: vendaAtual.id,
        documento_id: docFiscalNFe?.id,
      })
      if (res.sucesso && res.status === 'Autorizada') {
        toast({
          title: 'NF-e Autorizada pela SEFAZ',
          description: `Nota nº ${res.numero || ''} autorizada. Protocolo: ${res.protocolo || ''}`,
        })
      } else if (res.status === 'Processando') {
        toast({
          title: 'NF-e em Processamento',
          description: 'A SEFAZ ainda está processando a nota. Tente novamente em alguns segundos.',
        })
      } else if (res.status === 'Rejeitada') {
        toast({
          title: 'NF-e Rejeitada',
          description: res.message || 'Verifique as pendências da nota.',
          variant: 'destructive',
        })
      }
      const atual = await obterVendaCompleta(vendaAtual.id)
      setVendaAtual(atual.venda)
      recarregarDocumentoFiscal()
    } catch (err: any) {
      toast({
        title: 'Erro ao consultar situação',
        description: err?.data?.message || err?.message || 'Falha na comunicação com a Focus NFe.',
        variant: 'destructive',
      })
    } finally {
      setConsultandoSituacaoNFe(false)
    }
  }

  const handleBaixarXmlNFe = () => {
    if (docFiscalNFe?.id && docFiscalNFe?.xml_arquivo) {
      const pbUrl = import.meta.env.VITE_POCKETBASE_URL || ''
      const urlXml = `${pbUrl}/api/files/documentos_fiscais/${docFiscalNFe.id}/${docFiscalNFe.xml_arquivo}`
      window.open(urlXml, '_blank')
    } else {
      toast({
        title: 'XML não disponível',
        description: 'O arquivo XML ainda não foi sincronizado pelo servidor.',
        variant: 'destructive',
      })
    }
  }

  const handleAbrirDanfe = () => {
    const url = docFiscalNFe?.danfe_url || danfeUrlNota
    if (url) {
      window.open(url, '_blank')
    } else {
      toast({
        title: 'DANFE indisponível',
        description: 'URL do DANFE não encontrada para esta nota.',
        variant: 'destructive',
      })
    }
  }

  // Emissão Manual de NFC-e no Detalhe da Venda
  const handleEmitirNfceManual = async () => {
    if (!vendaAtual?.id) return
    if (!configFiscal?.csc_configurado) {
      toast({
        title: 'CSC não configurado',
        description: 'CSC da NFC-e não configurado para esta loja.',
        variant: 'destructive',
      })
      return
    }

    setEmitindoNfceManual(true)
    try {
      const resp = await emitirNFCeVenda({ vendaId: vendaAtual.id })
      if (resp.sucesso && resp.status === 'Autorizada') {
        toast({
          title: resp.contingencia
            ? 'NFC-e Emitida em Contingência!'
            : 'NFC-e Autorizada com sucesso!',
          description: `Nota nº ${resp.numero || ''} autorizada na SEFAZ.`,
        })
        if (resp.danfe_url) {
          setDanfeUrlNota(resp.danfe_url)
          imprimirDanfeUrl(resp.danfe_url)
        }
        // Recarrega venda completa
        const atual = await obterVendaCompleta(vendaAtual.id)
        setVendaAtual(atual.venda)
      } else {
        toast({
          title: 'NFC-e Rejeitada pela SEFAZ',
          description: resp.message || 'Verifique as informações fiscais e tente novamente.',
          variant: 'destructive',
        })
        const atual = await obterVendaCompleta(vendaAtual.id)
        setVendaAtual(atual.venda)
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Falha na emissão da NFC-e.'
      toast({
        title: 'Erro na emissão fiscal',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setEmitindoNfceManual(false)
    }
  }

  // Reimpressão DANFCe
  const handleReimprimirDanfce = () => {
    if (danfeUrlNota) {
      imprimirDanfeUrl(danfeUrlNota)
    } else {
      toast({
        title: 'DANFCe indisponível',
        description: 'URL de impressão da nota fiscal não encontrada.',
        variant: 'destructive',
      })
    }
  }

  // Ação de Pré-visualização da Nota Fiscal (Só leitura)
  const handlePrevisualizarNota = async () => {
    if (!vendaAtual?.id) return
    setModalPrevisualizarNotaAberto(true)
    setCarregandoPrevisualizacao(true)
    setErroPrevisualizacao(null)
    try {
      const res = await montarDocumentoFiscal({
        origem: 'Venda',
        id: vendaAtual.id,
        modelo: '55',
      })
      setDadosPrevisualizacao(res)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao montar pré-visualização da nota fiscal.'
      setErroPrevisualizacao(msg)
      toast({
        title: 'Erro na pré-visualização',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setCarregandoPrevisualizacao(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Barra de Título e Ações */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => navigate('/vendas/pedidos')}
            className="h-8 w-8 text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={18} />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {ehEdicao ? `${tipo} #${numero}` : 'Novo Orçamento ou Pedido de Venda'}
              </h1>
              {ehEdicao && (
                <div className="flex items-center gap-1.5">
                  <Badge
                    className={
                      status === 'Finalizada'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : status === 'Cancelada'
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                    }
                  >
                    {status}
                  </Badge>
                  {docFiscalStatus &&
                    docFiscalStatus !== 'Não emitido' &&
                    (docFiscalStatus as any) !== 'Não emitida' && (
                      <Badge
                        className={
                          docFiscalStatus === 'Autorizada'
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : docFiscalStatus === 'Cancelada'
                              ? 'bg-slate-100 text-slate-800 border-slate-300'
                              : docFiscalStatus === 'Denegada'
                                ? 'bg-red-100 text-red-800 border-red-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                        }
                      >
                        {docFiscalNFe?.modelo === '55' || tipo === 'Pedido' ? 'NF-e' : 'NFC-e'}{' '}
                        {docFiscalStatus}
                      </Badge>
                    )}{' '}
                </div>
              )}{' '}
            </div>
            <p className="text-xs text-slate-500">
              {ehEdicao
                ? 'Visualize e gerencie os detalhes comerciais desta venda'
                : 'Preencha os dados do cliente, produtos, descontos e condição comercial'}
            </p>
          </div>
        </div>

        {/* Botões de Ação do Cabeçalho */}
        <div className="flex flex-wrap items-center gap-2">
          {ehEdicao && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleImprimir}
                className="text-xs gap-1.5"
              >
                <Printer size={14} />
                <span>Imprimir/PDF</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleWhatsApp}
                className="text-xs gap-1.5 text-emerald-700 hover:text-emerald-800"
              >
                <Send size={14} />
                <span>WhatsApp</span>
              </Button>
              {podeEditar && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDuplicar}
                  className="text-xs gap-1.5"
                >
                  <Copy size={14} />
                  <span>Duplicar</span>
                </Button>
              )}
              {tipo === 'Orçamento' && !formularioBloqueado && podeEditar && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConverterPedido}
                  className="text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <ArrowRightCircle size={14} />
                  <span>Converter em Pedido</span>
                </Button>
              )}
              {status === 'Pedido em aberto' && podeEditar && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setModalFinalizarAberto(true)}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  <span>Finalizar Venda</span>
                </Button>
              )}
              {/* Botões de Acompanhamento e Ações da NF-e Autorizada */}
              {ehFinalizada && temNfeAutorizada && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAbrirDanfe}
                    className="text-xs text-blue-700 border-blue-200 hover:bg-blue-50 gap-1.5"
                  >
                    <Printer size={14} />
                    <span>Abrir DANFE</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBaixarXmlNFe}
                    className="text-xs text-slate-700 border-slate-200 hover:bg-slate-50 gap-1.5"
                  >
                    <FileText size={14} />
                    <span>Baixar XML</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setModalEnviarEmailNFeAberto(true)}
                    className="text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1.5"
                  >
                    <Mail size={14} />
                    <span>Enviar por e-mail</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setModalCartaCorrecaoAberto(true)}
                    className="text-xs text-amber-700 border-amber-200 hover:bg-amber-50 gap-1.5"
                  >
                    <Copy size={14} />
                    <span>Carta de correção (CC-e)</span>
                  </Button>

                  {podeExcluir && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setModalCancelarNFeAberto(true)}
                      className="text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                    >
                      <Ban size={14} />
                      <span>Cancelar NF-e</span>
                    </Button>
                  )}
                </>
              )}
              {/* Botão de Consulta de Situação quando NF-e estiver Processando */}
              {ehFinalizada && nfeEmProcessamento && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={consultandoSituacaoNFe}
                  onClick={handleConsultarSituacaoNFe}
                  className="text-xs text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 gap-1.5"
                >
                  <RefreshCw size={14} className={consultandoSituacaoNFe ? 'animate-spin' : ''} />
                  <span>
                    {consultandoSituacaoNFe ? 'Consultando...' : 'Consultar situação SEFAZ'}
                  </span>
                </Button>
              )}
              {/* Botão Emitir NF-e (Modelo 55) */}
              {podeEmitirNFe && !temNfeAutorizada && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setModalEmitirNFeAberto(true)}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                >
                  <FileText size={14} />
                  <span>Emitir NF-e</span>
                </Button>
              )}
              {/* NFC-e */}
              {ehFinalizada && temNfceAutorizada && danfeUrlNota && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReimprimirDanfce}
                  className="text-xs text-purple-700 border-purple-200 hover:bg-purple-50 gap-1.5"
                >
                  <Printer size={14} />
                  <span>Reimprimir DANFCe</span>
                </Button>
              )}
              {podeEmitirNfceManual && !temNfeAutorizada && (
                <Button
                  type="button"
                  size="sm"
                  disabled={emitindoNfceManual}
                  onClick={handleEmitirNfceManual}
                  className="text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                >
                  {emitindoNfceManual ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Transmitindo NFC-e...</span>
                    </>
                  ) : (
                    <>
                      <FileText size={14} />
                      <span>Emitir NFC-e</span>
                    </>
                  )}
                </Button>
              )}
              {ehFinalizada && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrevisualizarNota}
                  className="text-xs text-blue-700 border-blue-200 hover:bg-blue-50 gap-1.5"
                >
                  <FileText size={14} />
                  <span>Pré-visualizar impostos</span>
                </Button>
              )}
              {ehFinalizada && podeExcluir && !temNfeAutorizada && !temNfceAutorizada && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalCancelarAberto(true)}
                  className="text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                >
                  <Ban size={14} />
                  <span>Cancelar Venda</span>
                </Button>
              )}{' '}
            </>
          )}

          {!formularioBloqueado && podeEditar && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSalvar('Orçamento')}
                disabled={salvando}
                className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50 gap-1.5"
              >
                <Save size={14} />
                <span>Salvar como Orçamento</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleSalvar('Pedido')}
                disabled={salvando}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                {salvando ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Salvar como Pedido</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {formularioBloqueado && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
          <Info size={16} className="shrink-0 text-amber-600" />
          <span>
            Esta venda está <strong>{status}</strong>. O formulário está em modo somente leitura
            para garantir a integridade fiscal, contábil e de estoque.
          </span>
        </div>
      )}

      {/* Grid Principal: Cabeçalho do Cliente e Comercial */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card do Cliente */}
        <Card className="lg:col-span-2 shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Identificação do Cliente
            </CardTitle>
            {!formularioBloqueado && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalClienteRapidoAberto(true)}
                className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 gap-1"
              >
                <UserPlus size={13} />
                Cadastro Rápido
              </Button>
            )}
          </CardHeader>

          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Cliente <span className="text-red-500">*</span>
                </Label>
                <SelectCliente
                  value={clienteId}
                  disabled={formularioBloqueado}
                  onChange={(cId, cli) => handleSelecionarCliente(cId, cli)}
                  placeholder="Busque por código, razão social, CPF/CNPJ..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">CPF/CNPJ na Nota</Label>
                <Input
                  value={cpfCnpjConsumidor}
                  disabled={formularioBloqueado}
                  onChange={(e) => setCpfCnpjConsumidor(e.target.value)}
                  placeholder="000.000.000-00"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Quadro de Crédito do Cliente (visível quando cliente selecionado não for consumidor final) */}
            {clienteSelecionado && !clienteSelecionado.consumidor_final && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <DollarSign size={15} className="text-blue-600" />
                    <span>Situação de Crédito e Vendas a Prazo</span>
                  </div>
                  {credito?.situacao === 'Bloqueado' ? (
                    <Badge className="bg-red-100 text-red-800 border-red-300">
                      Cliente Bloqueado
                    </Badge>
                  ) : credito?.situacao === 'Atenção' ? (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                      Crédito em Atenção
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                      Crédito Liberado
                    </Badge>
                  )}
                </div>

                {carregandoCredito ? (
                  <div className="flex items-center gap-2 text-slate-400 py-1">
                    <Loader2 size={13} className="animate-spin" />
                    <span>Consultando financeiro...</span>
                  </div>
                ) : credito ? (
                  <div className="grid grid-cols-4 gap-2 pt-1 text-[11px]">
                    <div className="p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase">
                        Limite Total
                      </span>
                      <strong className="text-slate-800 font-semibold">
                        {credito.limite_credito !== null
                          ? `R$ ${Number(credito.limite_credito).toFixed(2)}`
                          : 'Ilimitado'}
                      </strong>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase">Em Aberto</span>
                      <strong className="text-blue-700 font-semibold">
                        R$ {Number(credito.total_aberto || 0).toFixed(2)}
                      </strong>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase">Em Atraso</span>
                      <strong
                        className={`font-semibold ${credito.total_vencido > 0 ? 'text-red-600' : 'text-slate-600'}`}
                      >
                        R$ {Number(credito.total_vencido || 0).toFixed(2)}
                      </strong>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase">
                        Saldo Disponível
                      </span>
                      <strong
                        className={`font-semibold ${(credito.credito_disponivel ?? 0) <= 0 && credito.limite_credito !== null ? 'text-amber-600' : 'text-emerald-700'}`}
                      >
                        {credito.credito_disponivel !== null
                          ? `R$ ${Number(credito.credito_disponivel).toFixed(2)}`
                          : 'Ilimitado'}
                      </strong>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card Comercial */}
        <Card className="shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-100">
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Dados Comerciais
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Vendedor Responsável</Label>
              <Select
                value={vendedorId}
                disabled={formularioBloqueado}
                onValueChange={setVendedorId}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione o vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      {v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Emissão</Label>
                <Input
                  type="date"
                  value={dataEmissao}
                  disabled={formularioBloqueado}
                  onChange={(e) => setDataEmissao(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Validade da Proposta</Label>
                <Input
                  type="date"
                  value={dataValidade}
                  disabled={formularioBloqueado}
                  onChange={(e) => setDataValidade(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Condição de Pagamento</Label>
              <SelectCondicaoPagamento
                uso="Vendas"
                value={condicaoPagamentoId}
                disabled={formularioBloqueado}
                onChange={(cId) => setCondicaoPagamentoId(cId)}
                placeholder="Selecione a condição..."
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Itens da Venda */}
      <Card className="shadow-xs">
        <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Itens do Pedido ({itens.length})
            </CardTitle>
            <p className="text-[11px] text-slate-400">
              Busca de produtos por nome, código, GTIN ou leitor de código de barras
            </p>
          </div>

          {!formularioBloqueado && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <BuscaProdutoGtin
                  placeholder="Bipe o código de barras (GTIN) ou digite descrição para adicionar item rápido..."
                  onSelecionarProduto={(prod) => handleAdicionarProduto(prod)}
                />{' '}
              </div>
              <div className="w-64">
                <SelectProduto
                  onChange={(_, p) => {
                    if (p) handleAdicionarProduto(p)
                  }}
                  placeholder="Buscar produto por nome..."
                />
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {itens.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <FileText className="h-8 w-8 mx-auto mb-1 text-slate-300 stroke-1" />
              Nenhum produto adicionado. Use os campos acima para bipar ou selecionar itens.
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Produto / Descrição</th>
                  <th className="py-2.5 px-2 text-center w-16">Estoque</th>
                  <th className="py-2.5 px-2 text-center w-14">UN</th>
                  <th className="py-2.5 px-2 text-right w-24">Qtd.</th>
                  <th className="py-2.5 px-2 text-right w-28">Preço Unit.</th>
                  <th className="py-2.5 px-2 text-right w-24">Desc. (%)</th>
                  <th className="py-2.5 px-2 text-right w-28">Desc. (R$)</th>
                  <th className="py-2.5 px-3 text-right w-32">Total (R$)</th>
                  {!formularioBloqueado && <th className="py-2.5 px-2 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((it, idx) => (
                  <tr key={it.tempId} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>

                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">{it.descricao}</div>
                      {it.preco_tabela !== undefined && it.preco_tabela > 0 && (
                        <div className="text-[10px] text-slate-400">
                          Tabela: R$ {Number(it.preco_tabela).toFixed(2)}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`font-semibold ${
                          (it.saldoEstoque || 0) <= 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {it.saldoEstoque !== undefined ? it.saldoEstoque : '-'}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-center font-mono uppercase text-slate-500">
                      {it.unidade}
                    </td>

                    <td className="py-2.5 px-2 text-right">
                      {formularioBloqueado ? (
                        <span className="font-semibold">{it.quantidade}</span>
                      ) : (
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={it.quantidade}
                          onChange={(e) =>
                            handleAtualizarItem(
                              it.tempId,
                              'quantidade',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-7 text-xs text-right font-medium w-20 ml-auto"
                        />
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-right">
                      {formularioBloqueado ? (
                        <span className="font-semibold">
                          R$ {Number(it.preco_unitario).toFixed(2)}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.preco_unitario}
                          onChange={(e) =>
                            handleAtualizarItem(
                              it.tempId,
                              'preco_unitario',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-7 text-xs text-right font-medium w-24 ml-auto"
                        />
                      )}
                    </td>

                    {/* Desconto Percentual */}
                    <td className="py-2.5 px-2 text-right">
                      {formularioBloqueado ? (
                        <span>{Number(it.desconto_percentual || 0).toFixed(2)}%</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={it.desconto_percentual || ''}
                            onChange={(e) =>
                              handleAtualizarItem(
                                it.tempId,
                                'desconto_percentual',
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            onBlur={() => handleValidarDescontoItem(it)}
                            className="h-7 text-xs text-right w-16"
                          />
                        </div>
                      )}
                    </td>

                    {/* Desconto Valor */}
                    <td className="py-2.5 px-2 text-right">
                      {formularioBloqueado ? (
                        <span>R$ {Number(it.desconto_valor || 0).toFixed(2)}</span>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.desconto_valor || ''}
                          onChange={(e) =>
                            handleAtualizarItem(
                              it.tempId,
                              'desconto_valor',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          onBlur={() => handleValidarDescontoItem(it)}
                          className="h-7 text-xs text-right w-24 ml-auto"
                        />
                      )}
                    </td>

                    {/* Total do Item */}
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      R$ {Number(it.valor_total || 0).toFixed(2)}
                    </td>

                    {!formularioBloqueado && (
                      <td className="py-2.5 px-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoverItem(it.tempId)}
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Rodapé: Totais, Desconto Global, Frete, Margem e Observações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Observações */}
        <Card className="shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-100">
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Observações e Instruções
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Observações impressas no Pedido / Orçamento (visível ao Cliente)
              </Label>
              <Textarea
                rows={3}
                value={observacaoCliente}
                disabled={formularioBloqueado}
                onChange={(e) => setObservacaoCliente(e.target.value)}
                placeholder="Ex.: Frete CIF, entrega agendada para 5 dias úteis, garantia de 90 dias..."
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Observações Internas (Não impressas para o cliente)
              </Label>
              <Textarea
                rows={2}
                value={observacao}
                disabled={formularioBloqueado}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: Aprovado pelo gerente comercial com condição especial..."
                className="text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quadro de Totais e Margem Estimada */}
        <Card className="shadow-xs">
          <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-100">
            <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Totalizadores da Venda
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5 text-xs">
            <div className="flex justify-between items-center text-slate-600">
              <span>Subtotal dos Produtos:</span>
              <strong className="text-slate-900 font-mono text-sm">
                R$ {subtotalProdutos.toFixed(2)}
              </strong>
            </div>

            <div className="flex justify-between items-center text-slate-600">
              <span>Descontos nos Itens:</span>
              <strong className="text-red-600 font-mono">
                - R$ {totalDescontoItens.toFixed(2)}
              </strong>
            </div>

            <div className="flex justify-between items-center text-slate-600">
              <span>Desconto no Total (R$):</span>
              {formularioBloqueado ? (
                <strong className="text-red-600 font-mono">
                  - R$ {Number(valorDescontoTotal).toFixed(2)}
                </strong>
              ) : (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorDescontoTotal || ''}
                  onChange={(e) => setValorDescontoTotal(parseFloat(e.target.value) || 0)}
                  className="h-7 w-28 text-right text-xs text-red-600 font-medium"
                />
              )}
            </div>

            <div className="flex justify-between items-center text-slate-600">
              <span>Acréscimos (R$):</span>
              {formularioBloqueado ? (
                <strong className="text-slate-900 font-mono">
                  + R$ {Number(valorAcrescimo).toFixed(2)}
                </strong>
              ) : (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorAcrescimo || ''}
                  onChange={(e) => setValorAcrescimo(parseFloat(e.target.value) || 0)}
                  className="h-7 w-28 text-right text-xs"
                />
              )}
            </div>

            <div className="flex justify-between items-center text-slate-600">
              <span>Valor do Frete (R$):</span>
              {formularioBloqueado ? (
                <strong className="text-slate-900 font-mono">
                  + R$ {Number(valorFrete).toFixed(2)}
                </strong>
              ) : (
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorFrete || ''}
                  onChange={(e) => setValorFrete(parseFloat(e.target.value) || 0)}
                  className="h-7 w-28 text-right text-xs"
                />
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
              <span className="text-sm font-bold text-slate-900 uppercase">VALOR TOTAL:</span>
              <strong className="text-xl font-bold text-blue-700 font-mono">
                R$ {totalGeralCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </div>

            {/* Margem Estimada (visível só para quem tem editar em produtos) */}
            {podeVerMargem && (
              <div className="mt-3 p-2.5 bg-blue-50/70 rounded-lg border border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-blue-950 font-semibold">
                  <TrendingUp size={15} className="text-blue-600" />
                  <span>Margem Estimada:</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-blue-900 text-sm">
                    {margemEstimada.percentual.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-blue-700 block">
                    Lucro bruto aprox. R$ {margemEstimada.lucro.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Cadastro Rápido de Cliente */}
      <ClienteCadastroRapido
        aberto={modalClienteRapidoAberto}
        onOpenChange={setModalClienteRapidoAberto}
        onSucesso={(novoCliente) => {
          handleSelecionarCliente(novoCliente.id, novoCliente)
        }}
      />

      {/* Modal Autorização de Supervisor */}
      {itemParaAutorizar && (
        <ModalAutorizacaoSupervisor
          aberto={modalSupervisorAberto}
          onOpenChange={(aberto) => {
            setModalSupervisorAberto(aberto)
            if (!aberto) setItemParaAutorizar(null)
          }}
          descontoPercentual={itemParaAutorizar.descontoPercentual}
          produtoNome={itemParaAutorizar.produtoNome}
          produtoId={itemParaAutorizar.produtoId}
          empresaId={empresaAtiva?.id}
          onAutorizado={() => {
            setItemParaAutorizar(null)
          }}
        />
      )}

      {/* Modal de Finalizar Venda */}
      {vendaAtual && (
        <ModalFinalizarVenda
          aberto={modalFinalizarAberto}
          onOpenChange={setModalFinalizarAberto}
          venda={vendaAtual}
          condicaoVendaId={condicaoPagamentoId}
          onSucesso={async (res) => {
            setStatus('Finalizada')
            try {
              const { venda, itens: its, pagamentos } = await obterVendaCompleta(res.venda_id)
              setVendaAtual(venda)
              imprimirComprovanteNaoFiscal({
                venda,
                itens: its,
                pagamentos,
                empresa: empresaAtiva || {},
                cliente: clienteSelecionado || undefined,
                vendedorNome: vendedores.find((v) => v.id === vendedorId)?.nome,
              })
            } catch {
              /* intentionally ignored */
            }
          }}
        />
      )}

      {/* Modal de Cancelar Venda */}
      {vendaAtual && (
        <ModalCancelarVenda
          aberto={modalCancelarAberto}
          onOpenChange={setModalCancelarAberto}
          venda={vendaAtual}
          onSucesso={() => {
            setStatus('Cancelada')
            if (vendaAtual) setVendaAtual({ ...vendaAtual, status: 'Cancelada' })
          }}
        />
      )}

      {/* Modal de Pré-visualização da Nota Fiscal */}
      {vendaAtual && (
        <ModalPrevisualizarNota
          aberto={modalPrevisualizarNotaAberto}
          onOpenChange={setModalPrevisualizarNotaAberto}
          dados={dadosPrevisualizacao}
          carregando={carregandoPrevisualizacao}
          erro={erroPrevisualizacao}
          onRecarregar={handlePrevisualizarNota}
        />
      )}

      {/* Modal de Emissão e Conferência da NF-e (Modelo 55) */}
      {vendaAtual && (
        <ModalEmitirNFe
          open={modalEmitirNFeAberto}
          onOpenChange={setModalEmitirNFeAberto}
          venda={vendaAtual}
          onSucesso={async () => {
            const atual = await obterVendaCompleta(vendaAtual.id)
            setVendaAtual(atual.venda)
            recarregarDocumentoFiscal()
          }}
        />
      )}

      {/* Modal de Cancelamento de NF-e */}
      {vendaAtual && (
        <ModalCancelarNFe
          open={modalCancelarNFeAberto}
          onOpenChange={setModalCancelarNFeAberto}
          documentoId={docFiscalNFe?.id}
          vendaId={vendaAtual.id}
          numeroNFe={docFiscalNFe?.numero || vendaAtual.numero}
          onSucesso={async () => {
            const atual = await obterVendaCompleta(vendaAtual.id)
            setVendaAtual(atual.venda)
            recarregarDocumentoFiscal()
          }}
        />
      )}

      {/* Modal de Carta de Correção (CC-e) */}
      {vendaAtual && (
        <ModalCartaCorrecao
          open={modalCartaCorrecaoAberto}
          onOpenChange={setModalCartaCorrecaoAberto}
          documentoId={docFiscalNFe?.id}
          vendaId={vendaAtual.id}
          numeroNFe={docFiscalNFe?.numero || vendaAtual.numero}
          onSucesso={() => {
            recarregarDocumentoFiscal()
          }}
        />
      )}

      {/* Modal de Enviar NF-e por E-mail */}
      {vendaAtual && (
        <ModalEnviarEmailNFe
          open={modalEnviarEmailNFeAberto}
          onOpenChange={setModalEnviarEmailNFeAberto}
          documentoId={docFiscalNFe?.id}
          vendaId={vendaAtual.id}
          emailDestinatarioPadrao={clienteSelecionado?.email || ''}
          numeroNFe={docFiscalNFe?.numero || vendaAtual.numero}
        />
      )}
    </div>
  )
}
export default VendaFormPage
