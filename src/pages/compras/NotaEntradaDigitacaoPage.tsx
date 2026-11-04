import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FileText,
  Plus,
  Trash2,
  Calculator,
  Calendar,
  Truck,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Package,
  Layers,
  ArrowLeft,
  Save,
  Barcode,
  Search,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import { SelectFornecedor } from '@/components/SelectFornecedor'
import { SelectCondicaoPagamento } from '@/components/SelectCondicaoPagamento'
import { BuscaProdutoGtin } from '@/components/BuscaProdutoGtin'
import { validarChaveAcessoNfe } from '@/lib/validacoes'
import {
  ModeloNota,
  salvarNotaEntradaDigitada,
  CriarNotaDigitadaInput,
  ItemNotaDigitadaInput,
  ParcelaNotaDigitadaInput,
} from '@/services/notasEntrada'
import { TIPOS_ENTRADA, TipoEntradaNota, converterCfopEntrada } from '@/services/cfopConversao'
import { Produto } from '@/services/produtos'
import { Fornecedor, obterFornecedorPorId } from '@/services/fornecedores'
import { gerarParcelas, obterCondicaoPorId } from '@/services/condicoesPagamento'
import { obterPedidoCompraPorId, PedidoCompraCompleto } from '@/services/pedidosCompra'
import { obterProdutoPorId } from '@/services/produtos'

interface ItemFormulario {
  idTemp: string
  numero_item: number
  produto: Produto
  codigo_fornecedor: string
  descricao_fornecedor: string
  gtin_fornecedor: string
  ncm_fornecedor: string
  cest_fornecedor: string
  unidade_fornecedor: string
  cfop_fornecedor: string
  quantidade_fornecedor: number
  valor_unitario_fornecedor: number
  valor_produto: number
  valor_desconto: number
  valor_frete: number
  valor_seguro: number
  valor_outras: number
  origem: string
  cst_icms_fornecedor: string
  base_icms: number
  aliquota_icms: number
  valor_icms: number
  base_icms_st: number
  aliquota_icms_st: number
  valor_icms_st: number
  valor_fcp_st: number
  cst_ipi: string
  base_ipi: number
  aliquota_ipi: number
  valor_ipi: number
  cst_pis_fornecedor: string
  valor_pis: number
  cst_cofins_fornecedor: string
  valor_cofins: number
  cfop_entrada: string
  cst_icms_entrada: string
}

export const NotaEntradaDigitacaoPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pedidoParamId = searchParams.get('pedido') || ''
  const { empresaAtiva, selecionarEmpresa } = useEmpresaAtiva()
  const { toast } = useToast()

  // Cabeçalho
  const [modelo, setModelo] = useState<ModeloNota>('55')
  const [serie, setSerie] = useState('1')
  const [numero, setNumero] = useState<number | ''>('')
  const [chaveAcesso, setChaveAcesso] = useState('')
  const [chaveStatus, setChaveStatus] = useState<{ valida: boolean; msg?: string } | null>(null)

  const [fornecedorId, setFornecedorId] = useState('')
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null)

  const hoje = new Date().toISOString().slice(0, 10)
  const [dataEmissao, setDataEmissao] = useState(hoje)
  const [dataEntrada, setDataEntrada] = useState(hoje)
  const [tipoEntrada, setTipoEntrada] = useState<TipoEntradaNota>('Compra para revenda')
  const [naturezaOperacao, setNaturezaOperacao] = useState('COMPRA PARA ENTRADA')

  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState('')
  const [modalidadeFrete, setModalidadeFrete] = useState<number>(9)
  const [transportadoraId, setTransportadoraId] = useState('')
  const [informacoesComplementares, setInformacoesComplementares] = useState('')
  const [pedidoCompraId, setPedidoCompraId] = useState<string>(pedidoParamId)
  const [pedidoOrigem, setPedidoOrigem] = useState<PedidoCompraCompleto | null>(null)
  const pedidoCarregadoRef = useRef(false)

  // Totais adicionais globais a ratear
  const [freteGlobal, setFreteGlobal] = useState<number>(0)
  const [seguroGlobal, setSeguroGlobal] = useState<number>(0)
  const [outrasGlobal, setOutrasGlobal] = useState<number>(0)
  const [descontoGlobal, setDescontoGlobal] = useState<number>(0)

  // Itens e Parcelas
  const [itens, setItens] = useState<ItemFormulario[]>([])
  const [parcelas, setParcelas] = useState<ParcelaNotaDigitadaInput[]>([])

  const [salvando, setSalvando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('cabecalho')

  // Ao selecionar fornecedor, carregar detalhes (UF, etc.)
  useEffect(() => {
    if (!fornecedorId) {
      setFornecedorSelecionado(null)
      return
    }
    obterFornecedorPorId(fornecedorId)
      .then((f) => {
        setFornecedorSelecionado(f)
        if (f.condicao_pagamento_id && !condicaoPagamentoId) {
          setCondicaoPagamentoId(f.condicao_pagamento_id)
        }
      })
      .catch(() => setFornecedorSelecionado(null))
  }, [fornecedorId, condicaoPagamentoId])

  // Validação da Chave de Acesso em tempo real (para 55 e 65)
  useEffect(() => {
    const limpa = chaveAcesso.replace(/\D/g, '')
    if (!limpa) {
      setChaveStatus(null)
      return
    }

    if (limpa.length !== 44) {
      setChaveStatus({
        valida: false,
        msg: `A chave possui ${limpa.length}/44 dígitos numéricos.`,
      })
      return
    }

    const res = validarChaveAcessoNfe(limpa)
    if (!res.valida) {
      setChaveStatus({ valida: false, msg: res.erro })
      return
    }

    // Conferência cruzada se o usuário já preencheu CNPJ ou dados
    const avisos: string[] = []
    if (res.modelo && ['55', '65', '01', '1B', '04'].includes(res.modelo)) {
      if (res.modelo !== modelo) {
        setModelo(res.modelo as ModeloNota)
        avisos.push(`Modelo atualizado para ${res.modelo}`)
      }
    }
    if (res.serie && (!serie || serie === '1')) {
      setSerie(res.serie)
    }
    if (res.numero && (!numero || numero === 0)) {
      setNumero(res.numero)
    }

    if (fornecedorSelecionado?.cpf_cnpj) {
      const cnpjForn = fornecedorSelecionado.cpf_cnpj.replace(/\D/g, '')
      if (res.cnpjEmitente && cnpjForn && res.cnpjEmitente !== cnpjForn) {
        avisos.push(
          `Atenção: CNPJ na chave (${res.cnpjEmitente}) difere do fornecedor selecionado (${cnpjForn}).`,
        )
      }
    }

    setChaveStatus({
      valida: true,
      msg:
        avisos.length > 0
          ? `Chave válida! ${avisos.join(' ')}`
          : 'Chave de acesso válida (DV módulo 11 correto).',
    })
  }, [chaveAcesso, fornecedorSelecionado, modelo, numero, serie])

  // Função auxiliar para derivar CFOP e CST de entrada ao adicionar produto
  const derivarCamposEntradaProduto = async (prod: Produto) => {
    const ufEmpresa = (empresaAtiva?.uf || 'ES').toUpperCase()
    const ufFornecedor = (fornecedorSelecionado?.uf || ufEmpresa).toUpperCase()
    const ehOperacaoInterna = ufEmpresa === ufFornecedor

    // CFOP de compra do produto conforme UF
    const cfopProdutoBase = ehOperacaoInterna
      ? prod.cfop_compra_interna || '1102'
      : prod.cfop_compra_interestadual || '2102'

    // Tabela cfop_conversao_entrada
    let cfopEntradaFinal = cfopProdutoBase
    try {
      const conv = await converterCfopEntrada(cfopProdutoBase, tipoEntrada)
      if (conv.cfopEntrada) {
        cfopEntradaFinal = conv.cfopEntrada
      }
    } catch {
      // mantém padrão
    }

    // CST ICMS de entrada sugerido
    const cstIcmsEntrada = prod.cst_icms || (prod.csosn ? '090' : '000')

    return {
      cfopFornecedor: cfopProdutoBase,
      cfopEntrada: cfopEntradaFinal,
      cstIcmsFornecedor: prod.cst_icms || (prod.csosn ? prod.csosn : '00'),
      cstIcmsEntrada,
      aliquotaIcms: prod.aliquota_icms || 0,
      aliquotaIpi: prod.aliquota_ipi || 0,
    }
  }

  // Carregamento inicial do Pedido de Compra quando informado via ?pedido=<id>
  useEffect(() => {
    if (!pedidoParamId || pedidoCarregadoRef.current) return

    let cancelado = false
    pedidoCarregadoRef.current = true

    async function carregarPedidoVinculado() {
      try {
        const ped = await obterPedidoCompraPorId(pedidoParamId)
        if (cancelado) return

        setPedidoOrigem(ped)
        setPedidoCompraId(ped.id)

        // Alinhar empresa se necessário
        if (ped.empresa_id && (!empresaAtiva || empresaAtiva.id !== ped.empresa_id)) {
          try {
            selecionarEmpresa(ped.empresa_id)
          } catch {
            // mantém
          }
        }

        // Fornecedor e Condição de Pagamento do pedido
        if (ped.fornecedor_id) {
          setFornecedorId(ped.fornecedor_id)
        }
        if (ped.condicao_pagamento_id) {
          setCondicaoPagamentoId(ped.condicao_pagamento_id)
        }

        // Carregar fornecedor para obter detalhes de UF para derivação fiscal
        let fornObj: Fornecedor | null = null
        if (ped.fornecedor_id) {
          try {
            fornObj = await obterFornecedorPorId(ped.fornecedor_id)
            if (!cancelado && fornObj) setFornecedorSelecionado(fornObj)
          } catch {
            // ignora
          }
        }

        // Preencher itens: quantidade (pedida - recebida) e custo do pedido
        const novosItens: ItemFormulario[] = []
        let itemIndex = 1

        for (const itemPed of ped.itens || []) {
          const qtdPedida = Number(itemPed.quantidade || 0)
          const qtdRecebida = Number(
            itemPed.quantidade_recebida !== undefined
              ? itemPed.quantidade_recebida
              : (itemPed as any).qtd_recebida || 0,
          )
          const qtdPendente = Math.max(0, Number((qtdPedida - qtdRecebida).toFixed(4)))

          // Se a quantidade pendente for zero, não adiciona por padrão
          if (qtdPendente <= 0) continue

          const custoUnit = Number(itemPed.custo_unitario || 0)

          let prod = itemPed.expand?.produto_id
          if (!prod && itemPed.produto_id) {
            try {
              prod = await obterProdutoPorId(itemPed.produto_id)
            } catch {
              // ignora
            }
          }

          if (!prod) continue

          const dadosFiscais = await derivarCamposEntradaProduto(prod)
          const vProd = Number((qtdPendente * custoUnit).toFixed(2))

          novosItens.push({
            idTemp: Math.random().toString(36).substring(2, 9),
            numero_item: itemIndex++,
            produto: prod,
            codigo_fornecedor: String(prod.codigo || ''),
            descricao_fornecedor: prod.descricao,
            gtin_fornecedor: prod.gtin || '',
            ncm_fornecedor: prod.ncm || '',
            cest_fornecedor: prod.cest || '',
            unidade_fornecedor: prod.expand?.unidade_id?.sigla || 'UN',
            cfop_fornecedor: dadosFiscais.cfopFornecedor,
            quantidade_fornecedor: qtdPendente,
            valor_unitario_fornecedor: custoUnit,
            valor_produto: vProd,
            valor_desconto: 0,
            valor_frete: 0,
            valor_seguro: 0,
            valor_outras: 0,
            origem: prod.origem || '0',
            cst_icms_fornecedor: dadosFiscais.cstIcmsFornecedor,
            base_icms: vProd,
            aliquota_icms: dadosFiscais.aliquotaIcms,
            valor_icms: Number(((vProd * (dadosFiscais.aliquotaIcms || 0)) / 100).toFixed(2)),
            base_icms_st: 0,
            aliquota_icms_st: 0,
            valor_icms_st: 0,
            valor_fcp_st: 0,
            cst_ipi: prod.cst_ipi_entrada || '',
            base_ipi: vProd,
            aliquota_ipi: dadosFiscais.aliquotaIpi,
            valor_ipi: Number(((vProd * (dadosFiscais.aliquotaIpi || 0)) / 100).toFixed(2)),
            cst_pis_fornecedor: prod.cst_pis_entrada || '50',
            valor_pis: 0,
            cst_cofins_fornecedor: prod.cst_cofins_entrada || '50',
            valor_cofins: 0,
            cfop_entrada: dadosFiscais.cfopEntrada,
            cst_icms_entrada: dadosFiscais.cstIcmsEntrada,
          })
        }

        if (!cancelado && novosItens.length > 0) {
          setItens(novosItens)
          toast({
            title: `Pedido #${ped.numero} carregado`,
            description: `${novosItens.length} item(ns) pendente(s) preenchido(s) na nota de entrada.`,
          })
        }
      } catch (err: any) {
        if (!cancelado) {
          toast({
            title: 'Erro ao carregar pedido de compra',
            description: err?.message || 'Não foi possível carregar os dados do pedido vinculado.',
            variant: 'destructive',
          })
        }
      }
    }

    carregarPedidoVinculado()

    return () => {
      cancelado = true
    }
  }, [pedidoParamId, empresaAtiva, selecionarEmpresa, toast])

  // Adicionar produto selecionado à grade de itens
  const handleAdicionarProduto = async (prod: Produto, qtd = 1) => {
    const dadosFiscais = await derivarCamposEntradaProduto(prod)
    const vUnit = prod.preco_custo || 0
    const vProd = Number((qtd * vUnit).toFixed(2))

    const novoItem: ItemFormulario = {
      idTemp: Math.random().toString(36).substring(2, 9),
      numero_item: itens.length + 1,
      produto: prod,
      codigo_fornecedor: String(prod.codigo || ''),
      descricao_fornecedor: prod.descricao,
      gtin_fornecedor: prod.gtin || '',
      ncm_fornecedor: prod.ncm || '',
      cest_fornecedor: prod.cest || '',
      unidade_fornecedor: prod.expand?.unidade_id?.sigla || 'UN',
      cfop_fornecedor: dadosFiscais.cfopFornecedor,
      quantidade_fornecedor: qtd,
      valor_unitario_fornecedor: vUnit,
      valor_produto: vProd,
      valor_desconto: 0,
      valor_frete: 0,
      valor_seguro: 0,
      valor_outras: 0,
      origem: prod.origem || '0',
      cst_icms_fornecedor: dadosFiscais.cstIcmsFornecedor,
      base_icms: vProd,
      aliquota_icms: dadosFiscais.aliquotaIcms,
      valor_icms: Number(((vProd * (dadosFiscais.aliquotaIcms || 0)) / 100).toFixed(2)),
      base_icms_st: 0,
      aliquota_icms_st: 0,
      valor_icms_st: 0,
      valor_fcp_st: 0,
      cst_ipi: prod.cst_ipi_entrada || '',
      base_ipi: vProd,
      aliquota_ipi: dadosFiscais.aliquotaIpi,
      valor_ipi: Number(((vProd * (dadosFiscais.aliquotaIpi || 0)) / 100).toFixed(2)),
      cst_pis_fornecedor: prod.cst_pis_entrada || '50',
      valor_pis: 0,
      cst_cofins_fornecedor: prod.cst_cofins_entrada || '50',
      valor_cofins: 0,
      cfop_entrada: dadosFiscais.cfopEntrada,
      cst_icms_entrada: dadosFiscais.cstIcmsEntrada,
    }

    const novaLista = [...itens, novoItem]
    setItens(novaLista)
    toast({
      title: 'Produto adicionado',
      description: `${prod.descricao} inserido no item #${novaLista.length}.`,
    })
  }

  // Atualizar campo de um item
  const handleAtualizarItem = (idTemp: string, campo: keyof ItemFormulario, valor: any) => {
    setItens((prev) =>
      prev.map((it) => {
        if (it.idTemp !== idTemp) return it

        const atualizado = { ...it, [campo]: valor }

        // Recalcular valor do produto quando altera quantidade ou unitário
        if (campo === 'quantidade_fornecedor' || campo === 'valor_unitario_fornecedor') {
          const q =
            campo === 'quantidade_fornecedor' ? Number(valor) || 0 : it.quantidade_fornecedor
          const u =
            campo === 'valor_unitario_fornecedor'
              ? Number(valor) || 0
              : it.valor_unitario_fornecedor
          atualizado.valor_produto = Number((q * u).toFixed(2))
          atualizado.base_icms = atualizado.valor_produto
          atualizado.valor_icms = Number(
            ((atualizado.base_icms * (atualizado.aliquota_icms || 0)) / 100).toFixed(2),
          )
          atualizado.base_ipi = atualizado.valor_produto
          atualizado.valor_ipi = Number(
            ((atualizado.base_ipi * (atualizado.aliquota_ipi || 0)) / 100).toFixed(2),
          )
        }

        // Recalcular imposto quando altera alíquota ou base
        if (campo === 'aliquota_icms' || campo === 'base_icms') {
          const b = campo === 'base_icms' ? Number(valor) || 0 : it.base_icms
          const a = campo === 'aliquota_icms' ? Number(valor) || 0 : it.aliquota_icms
          atualizado.valor_icms = Number(((b * a) / 100).toFixed(2))
        }

        if (campo === 'aliquota_ipi' || campo === 'base_ipi') {
          const b = campo === 'base_ipi' ? Number(valor) || 0 : it.base_ipi
          const a = campo === 'aliquota_ipi' ? Number(valor) || 0 : it.aliquota_ipi
          atualizado.valor_ipi = Number(((b * a) / 100).toFixed(2))
        }

        return atualizado
      }),
    )
  }

  const handleRemoverItem = (idTemp: string) => {
    setItens((prev) => {
      const filtrados = prev.filter((it) => it.idTemp !== idTemp)
      return filtrados.map((it, idx) => ({ ...it, numero_item: idx + 1 }))
    })
  }

  // Ratear totais adicionais globais nos itens
  const handleRatearDespesasNosItens = () => {
    if (itens.length === 0) return
    const somaProdutos = itens.reduce((acc, it) => acc + (it.valor_produto || 0), 0)
    if (somaProdutos <= 0) return

    setItens((prev) =>
      prev.map((it) => {
        const proporcao = (it.valor_produto || 0) / somaProdutos
        return {
          ...it,
          valor_frete: Number((freteGlobal * proporcao).toFixed(2)),
          valor_seguro: Number((seguroGlobal * proporcao).toFixed(2)),
          valor_outras: Number((outrasGlobal * proporcao).toFixed(2)),
          valor_desconto: Number((descontoGlobal * proporcao).toFixed(2)),
        }
      }),
    )

    toast({
      title: 'Despesas rateadas',
      description:
        'Frete, seguro, outras despesas e desconto rateados proporcionalmente entre os itens.',
    })
  }

  // Totais calculados
  const totaisCalculados = useMemo(() => {
    const somaProdutos = itens.reduce((acc, it) => acc + (Number(it.valor_produto) || 0), 0)
    const somaIpi = itens.reduce((acc, it) => acc + (Number(it.valor_ipi) || 0), 0)
    const somaIcmsSt = itens.reduce((acc, it) => acc + (Number(it.valor_icms_st) || 0), 0)
    const somaFcpSt = itens.reduce((acc, it) => acc + (Number(it.valor_fcp_st) || 0), 0)
    const somaBaseIcms = itens.reduce((acc, it) => acc + (Number(it.base_icms) || 0), 0)
    const somaValorIcms = itens.reduce((acc, it) => acc + (Number(it.valor_icms) || 0), 0)
    const somaPis = itens.reduce((acc, it) => acc + (Number(it.valor_pis) || 0), 0)
    const somaCofins = itens.reduce((acc, it) => acc + (Number(it.valor_cofins) || 0), 0)

    const somaFreteItens = itens.reduce((acc, it) => acc + (Number(it.valor_frete) || 0), 0)
    const somaSeguroItens = itens.reduce((acc, it) => acc + (Number(it.valor_seguro) || 0), 0)
    const somaOutrasItens = itens.reduce((acc, it) => acc + (Number(it.valor_outras) || 0), 0)
    const somaDescontoItens = itens.reduce((acc, it) => acc + (Number(it.valor_desconto) || 0), 0)

    // Se rateado nos itens, usa soma dos itens; senão usa os globais
    const freteFinal = somaFreteItens > 0 ? somaFreteItens : freteGlobal
    const seguroFinal = somaSeguroItens > 0 ? somaSeguroItens : seguroGlobal
    const outrasFinal = somaOutrasItens > 0 ? somaOutrasItens : outrasGlobal
    const descontoFinal = somaDescontoItens > 0 ? somaDescontoItens : descontoGlobal

    const totalNota = Number(
      (
        somaProdutos +
        freteFinal +
        seguroFinal +
        outrasFinal +
        somaIpi +
        somaIcmsSt +
        somaFcpSt -
        descontoFinal
      ).toFixed(2),
    )

    const somaBaseIcmsSt = itens.reduce((acc, it) => acc + (Number(it.base_icms_st) || 0), 0)

    return {
      valorProdutos: Number(somaProdutos.toFixed(2)),
      valorFrete: Number(freteFinal.toFixed(2)),
      valorSeguro: Number(seguroFinal.toFixed(2)),
      valorOutras: Number(outrasFinal.toFixed(2)),
      valorDesconto: Number(descontoFinal.toFixed(2)),
      valorIpi: Number(somaIpi.toFixed(2)),
      baseIcmsSt: Number(somaBaseIcmsSt.toFixed(2)),
      valorIcmsSt: Number(somaIcmsSt.toFixed(2)),
      valorFcpSt: Number(somaFcpSt.toFixed(2)),
      baseIcms: Number(somaBaseIcms.toFixed(2)),
      valorIcms: Number(somaValorIcms.toFixed(2)),
      valorPis: Number(somaPis.toFixed(2)),
      valorCofins: Number(somaCofins.toFixed(2)),
      valorTotal: Math.max(0, totalNota),
    }
  }, [itens, freteGlobal, seguroGlobal, outrasGlobal, descontoGlobal])

  // Gerar Parcelas a partir da Condição de Pagamento selecionada
  const handleGerarParcelas = async () => {
    if (!condicaoPagamentoId) {
      toast({
        title: 'Condição não selecionada',
        description: 'Selecione uma condição de pagamento para gerar as parcelas.',
        variant: 'destructive',
      })
      return
    }

    if (totaisCalculados.valorTotal <= 0) {
      toast({
        title: 'Valor total zerado',
        description: 'Adicione itens na nota para obter o valor total antes de gerar parcelas.',
        variant: 'destructive',
      })
      return
    }

    try {
      const cond = await obterCondicaoPorId(condicaoPagamentoId)
      const parcelasCalc = gerarParcelas(cond, totaisCalculados.valorTotal, dataEmissao)

      const novasParcelas: ParcelaNotaDigitadaInput[] = parcelasCalc.map((p) => ({
        numero: String(p.numero).padStart(3, '0'),
        data_vencimento: p.data_vencimento,
        valor: p.valor,
        forma_pagamento: '15', // Boleto bancário ou duplicata padrão
      }))

      setParcelas(novasParcelas)
      toast({
        title: 'Parcelas geradas',
        description: `${novasParcelas.length} parcela(s) calculada(s) conforme a condição "${cond.nome}".`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar parcelas',
        description: err?.message || 'Falha ao calcular parcelas da condição.',
        variant: 'destructive',
      })
    }
  }

  // Adicionar parcela manual
  const handleAdicionarParcelaManual = () => {
    const proxNum = parcelas.length + 1
    const nova: ParcelaNotaDigitadaInput = {
      numero: String(proxNum).padStart(3, '0'),
      data_vencimento: dataEmissao,
      valor: 0,
      forma_pagamento: '15',
    }
    setParcelas([...parcelas, nova])
  }

  const handleAtualizarParcela = (
    idx: number,
    campo: keyof ParcelaNotaDigitadaInput,
    valor: any,
  ) => {
    setParcelas((prev) => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)))
  }

  const handleRemoverParcela = (idx: number) => {
    setParcelas((prev) => prev.filter((_, i) => i !== idx))
  }

  // Salvar nota digitada
  const handleSalvarNota = async () => {
    if (!empresaAtiva?.id) {
      toast({
        title: 'Empresa ativa não identificada',
        description: 'Selecione uma empresa ativa antes de lançar a nota.',
        variant: 'destructive',
      })
      return
    }

    if (!fornecedorId) {
      toast({
        title: 'Fornecedor obrigatório',
        description: 'Selecione o fornecedor da nota.',
        variant: 'destructive',
      })
      setAbaAtiva('cabecalho')
      return
    }

    if (!numero || Number(numero) <= 0) {
      toast({
        title: 'Número obrigatório',
        description: 'Informe o número da nota fiscal.',
        variant: 'destructive',
      })
      setAbaAtiva('cabecalho')
      return
    }

    if (
      (modelo === '55' || modelo === '65') &&
      (!chaveAcesso || chaveAcesso.replace(/\D/g, '').length !== 44)
    ) {
      toast({
        title: 'Chave de acesso obrigatória',
        description: `Para o modelo ${modelo}, a chave de acesso com 44 dígitos é obrigatória e deve ter DV válido.`,
        variant: 'destructive',
      })
      setAbaAtiva('cabecalho')
      return
    }

    if (chaveStatus && !chaveStatus.valida && (modelo === '55' || modelo === '65')) {
      toast({
        title: 'Chave de acesso inválida',
        description: chaveStatus.msg || 'Verifique os dígitos da chave de acesso.',
        variant: 'destructive',
      })
      setAbaAtiva('cabecalho')
      return
    }

    if (itens.length === 0) {
      toast({
        title: 'Nenhum item na nota',
        description: 'Adicione pelo menos um produto à grade de itens antes de salvar.',
        variant: 'destructive',
      })
      setAbaAtiva('itens')
      return
    }

    setSalvando(true)
    try {
      const itensPayload: ItemNotaDigitadaInput[] = itens.map((it) => ({
        numero_item: it.numero_item,
        produto_id: it.produto.id,
        codigo_fornecedor: it.codigo_fornecedor || String(it.produto.codigo),
        descricao_fornecedor: it.descricao_fornecedor,
        gtin_fornecedor: it.gtin_fornecedor || undefined,
        ncm_fornecedor: it.ncm_fornecedor || undefined,
        cest_fornecedor: it.cest_fornecedor || undefined,
        unidade_fornecedor: it.unidade_fornecedor,
        cfop_fornecedor: it.cfop_fornecedor || undefined,
        quantidade_fornecedor: it.quantidade_fornecedor,
        valor_unitario_fornecedor: it.valor_unitario_fornecedor,
        valor_produto: it.valor_produto,
        valor_desconto: it.valor_desconto,
        valor_frete: it.valor_frete,
        valor_seguro: it.valor_seguro,
        valor_outras: it.valor_outras,
        origem: it.origem,
        cst_icms_fornecedor: it.cst_icms_fornecedor,
        base_icms: it.base_icms,
        aliquota_icms: it.aliquota_icms,
        valor_icms: it.valor_icms,
        base_icms_st: it.base_icms_st,
        aliquota_icms_st: it.aliquota_icms_st,
        valor_icms_st: it.valor_icms_st,
        valor_fcp_st: it.valor_fcp_st,
        cst_ipi: it.cst_ipi,
        base_ipi: it.base_ipi,
        aliquota_ipi: it.aliquota_ipi,
        valor_ipi: it.valor_ipi,
        cst_pis_fornecedor: it.cst_pis_fornecedor,
        valor_pis: it.valor_pis,
        cst_cofins_fornecedor: it.cst_cofins_fornecedor,
        valor_cofins: it.valor_cofins,
        cfop_entrada: it.cfop_entrada,
        cst_icms_entrada: it.cst_icms_entrada,
      }))

      const payload: CriarNotaDigitadaInput = {
        empresa_id: empresaAtiva.id,
        fornecedor_id: fornecedorId,
        modelo,
        serie: serie || '1',
        numero: Number(numero),
        chave_acesso: chaveAcesso.replace(/\D/g, '') || undefined,
        data_emissao: dataEmissao,
        data_entrada: dataEntrada,
        tipo_entrada: tipoEntrada,
        natureza_operacao: naturezaOperacao,
        condicao_pagamento_id: condicaoPagamentoId || undefined,
        modalidade_frete: modalidadeFrete,
        transportadora_id: transportadoraId || undefined,
        pedido_compra_id: pedidoCompraId || undefined,
        informacoes_complementares: informacoesComplementares || undefined,
        valor_produtos: totaisCalculados.valorProdutos,
        valor_frete: totaisCalculados.valorFrete,
        valor_seguro: totaisCalculados.valorSeguro,
        valor_desconto: totaisCalculados.valorDesconto,
        valor_outras: totaisCalculados.valorOutras,
        valor_ipi: totaisCalculados.valorIpi,
        base_icms: totaisCalculados.baseIcms,
        valor_icms: totaisCalculados.valorIcms,
        base_icms_st: totaisCalculados.baseIcmsSt,
        valor_icms_st: totaisCalculados.valorIcmsSt,
        valor_fcp_st: totaisCalculados.valorFcpSt,
        valor_pis: totaisCalculados.valorPis,
        valor_cofins: totaisCalculados.valorCofins,
        valor_total: totaisCalculados.valorTotal,
        itens: itensPayload,
        parcelas,
      }

      const notaCriada = await salvarNotaEntradaDigitada(payload)

      toast({
        title: 'Nota salva com sucesso!',
        description: `Nota #${notaCriada.numero} gravada em conferência (origem: Digitação). Redirecionando para conferência fiscal...`,
      })

      // Redireciona imediatamente para a mesma tela de conferência existente
      navigate(`/compras/notas-entrada/${notaCriada.id}`)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar nota',
        description: err?.message || 'Falha inesperada ao gravar nota digitada.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Barra de Ações Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/compras/notas-entrada')}
            className="h-8 gap-1.5 text-xs text-slate-600"
          >
            <ArrowLeft size={14} />
            Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Lançamento de Nota de Entrada por Digitação
              </h1>
              <Badge
                variant="outline"
                className="text-[11px] bg-blue-50 text-blue-700 border-blue-200 font-semibold"
              >
                Sem XML
              </Badge>
              {pedidoOrigem && (
                <Badge
                  variant="outline"
                  className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
                >
                  Pedido #{pedidoOrigem.numero}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {pedidoOrigem ? (
                <span>
                  Gerando nota vinculada ao <strong>Pedido de Compra #{pedidoOrigem.numero}</strong>
                  . Fornecedor, condição e itens pendentes foram preenchidos previamente.
                </span>
              ) : (
                'Digitação manual de documentos fiscais ou físicos. Salva como "Em conferência" e segue o mesmo fluxo de conferência fiscal e estoque.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/compras/notas-entrada')}
            className="h-9 text-xs"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSalvarNota}
            disabled={salvando}
            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 font-medium shadow-xs"
          >
            <Save size={15} />
            {salvando ? 'Salvando Nota...' : 'Salvar em Conferência'}
          </Button>
        </div>
      </div>

      {/* Navegação em Abas */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 border border-slate-200">
          <TabsTrigger value="cabecalho" className="text-xs gap-1.5">
            <FileText size={14} />
            1. Cabeçalho e Transporte
          </TabsTrigger>
          <TabsTrigger value="itens" className="text-xs gap-1.5">
            <Package size={14} />
            2. Itens da Nota ({itens.length})
          </TabsTrigger>
          <TabsTrigger value="totais" className="text-xs gap-1.5">
            <Calculator size={14} />
            3. Totais e Rateios
          </TabsTrigger>
          <TabsTrigger value="parcelas" className="text-xs gap-1.5">
            <DollarSign size={14} />
            4. Condição e Parcelas ({parcelas.length})
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA 1: CABEÇALHO ================= */}
        <TabsContent value="cabecalho" className="space-y-4">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Dados do Documento Fiscal
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Modelo */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Modelo <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={modelo} onValueChange={(v) => setModelo(v as ModeloNota)}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="55">55 - NF-e (Nota Fiscal Eletrônica)</SelectItem>
                      <SelectItem value="65">65 - NFC-e (Consumidor Eletrônica)</SelectItem>
                      <SelectItem value="01">01 - Nota Fiscal Mod 1 / 1A</SelectItem>
                      <SelectItem value="1B">1B - Nota Fiscal Avulsa</SelectItem>
                      <SelectItem value="04">04 - Produtor Rural</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Série */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Série</Label>
                  <Input
                    type="text"
                    value={serie}
                    onChange={(e) => setSerie(e.target.value)}
                    placeholder="1"
                    className="text-xs h-9"
                  />
                </div>

                {/* Número */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Número da Nota <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value ? parseInt(e.target.value, 10) : '')}
                    placeholder="Ex: 12345"
                    className="text-xs h-9 font-mono font-bold"
                  />
                </div>

                {/* Tipo de Entrada */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Tipo de Entrada <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={tipoEntrada}
                    onValueChange={(v) => setTipoEntrada(v as TipoEntradaNota)}
                  >
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ENTRADA.map((tipo) => (
                        <SelectItem key={tipo} value={tipo} className="text-xs">
                          {tipo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Chave de Acesso (Obrigatória e validada para 55 e 65) */}
              <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Barcode className="h-4 w-4 text-blue-600" />
                    Chave de Acesso (44 dígitos)
                    {(modelo === '55' || modelo === '65') && (
                      <span className="text-rose-500">*</span>
                    )}
                  </Label>
                  {chaveStatus && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        chaveStatus.valida
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-rose-50 text-rose-700 border-rose-300'
                      }`}
                    >
                      {chaveStatus.valida ? (
                        <CheckCircle2 size={12} className="mr-1" />
                      ) : (
                        <AlertCircle size={12} className="mr-1" />
                      )}
                      {chaveStatus.valida ? 'Chave Válida' : 'Chave Inválida'}
                    </Badge>
                  )}
                </div>
                <Input
                  type="text"
                  maxLength={54}
                  value={chaveAcesso}
                  onChange={(e) => setChaveAcesso(e.target.value)}
                  placeholder="Digite ou cole os 44 dígitos da chave de acesso (NF-e/NFC-e)..."
                  className="font-mono text-xs tracking-wider h-9 bg-white"
                />
                {chaveStatus?.msg && (
                  <p
                    className={`text-[11px] mt-1 ${
                      chaveStatus.valida ? 'text-emerald-700' : 'text-rose-600 font-medium'
                    }`}
                  >
                    {chaveStatus.msg}
                  </p>
                )}
              </div>

              {/* Fornecedor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Fornecedor <span className="text-rose-500">*</span>
                  </Label>
                  <SelectFornecedor
                    value={fornecedorId}
                    onChange={(val) => setFornecedorId(val)}
                    placeholder="Selecione ou busque o fornecedor..."
                  />
                  {fornecedorSelecionado && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-3 pt-1">
                      <span>
                        CNPJ/CPF:{' '}
                        <strong className="font-mono text-slate-700">
                          {fornecedorSelecionado.cpf_cnpj || 'Não informado'}
                        </strong>
                      </span>
                      <span>
                        UF:{' '}
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {fornecedorSelecionado.uf || '—'}
                        </Badge>
                      </span>
                      <span>CRT: {fornecedorSelecionado.crt_fornecedor || 'Normal/Outros'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Natureza da Operação
                  </Label>
                  <Input
                    type="text"
                    value={naturezaOperacao}
                    onChange={(e) => setNaturezaOperacao(e.target.value)}
                    placeholder="COMPRA PARA ENTRADA"
                    className="text-xs h-9"
                  />
                </div>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    Data de Emissão <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={dataEmissao}
                    onChange={(e) => setDataEmissao(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    Data de Entrada / Recebimento <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={dataEntrada}
                    onChange={(e) => setDataEntrada(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-slate-400" />
                    Modalidade do Frete
                  </Label>
                  <Select
                    value={String(modalidadeFrete)}
                    onValueChange={(v) => setModalidadeFrete(parseInt(v, 10))}
                  >
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 - Por conta do Emitente (CIF)</SelectItem>
                      <SelectItem value="1">1 - Por conta do Destinatário (FOB)</SelectItem>
                      <SelectItem value="2">2 - Por conta de Terceiros</SelectItem>
                      <SelectItem value="9">9 - Sem Frete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1.5 pt-2">
                <Label className="text-xs font-semibold text-slate-700">
                  Informações Complementares / Observações
                </Label>
                <Input
                  type="text"
                  value={informacoesComplementares}
                  onChange={(e) => setInformacoesComplementares(e.target.value)}
                  placeholder="Dados adicionais, número de pedido externo ou observações da nota..."
                  className="text-xs h-9"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA 2: ITENS DA NOTA ================= */}
        <TabsContent value="itens" className="space-y-4">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  Grade de Itens da Nota
                </CardTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Adicione produtos do catálogo por código de barras (GTIN), código ou descrição. Os
                  impostos e CFOP serão sugeridos automaticamente.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {itens.length} item(ns)
              </Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Barra de Busca e Bipagem */}
              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <Label className="text-xs font-semibold text-blue-900 mb-1.5 block">
                  Buscar produto por GTIN / Código de Barras ou Descrição:
                </Label>
                <BuscaProdutoGtin
                  onSelecionarProduto={(p, q) => handleAdicionarProduto(p, q || 1)}
                  filtroControlaEstoque={false}
                  placeholder="Bipe o código de barras ou digite o nome/código do produto..."
                />
              </div>

              {/* Grade de Itens */}
              {itens.length === 0 ? (
                <div className="py-12 text-center text-slate-400 border border-dashed rounded-lg bg-slate-50/50">
                  <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-medium text-slate-600 text-sm">
                    Nenhum item adicionado à nota ainda.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Use a caixa de busca acima para incluir produtos na nota.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 px-3 w-10 text-center">#</th>
                        <th className="py-2 px-3 min-w-[200px]">Produto / Descrição</th>
                        <th className="py-2 px-3 w-20 text-center">UN</th>
                        <th className="py-2 px-3 w-24 text-right">Qtd</th>
                        <th className="py-2 px-3 w-28 text-right">V. Unitário (R$)</th>
                        <th className="py-2 px-3 w-28 text-right">V. Total (R$)</th>
                        <th className="py-2 px-3 w-24 text-center">CFOP Ent.</th>
                        <th className="py-2 px-3 w-20 text-center">CST Ent.</th>
                        <th className="py-2 px-3 w-28 text-right">ICMS (R$)</th>
                        <th className="py-2 px-3 w-28 text-right">IPI (R$)</th>
                        <th className="py-2 px-3 w-28 text-right">ICMS-ST (R$)</th>
                        <th className="py-2 px-3 w-12 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itens.map((it) => (
                        <tr key={it.idTemp} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                            {it.numero_item}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-900">
                              {it.descricao_fornecedor}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                              <span>Cód: #{it.produto.codigo}</span>
                              {it.ncm_fornecedor && <span>NCM: {it.ncm_fornecedor}</span>}
                              {it.gtin_fornecedor && <span>GTIN: {it.gtin_fornecedor}</span>}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Input
                              type="text"
                              value={it.unidade_fornecedor}
                              onChange={(e) =>
                                handleAtualizarItem(it.idTemp, 'unidade_fornecedor', e.target.value)
                              }
                              className="h-7 w-16 text-center text-xs uppercase"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={it.quantidade_fornecedor}
                              onChange={(e) =>
                                handleAtualizarItem(
                                  it.idTemp,
                                  'quantidade_fornecedor',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-7 w-20 text-right text-xs font-mono font-semibold"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.valor_unitario_fornecedor}
                              onChange={(e) =>
                                handleAtualizarItem(
                                  it.idTemp,
                                  'valor_unitario_fornecedor',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-7 w-24 text-right text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                            R$ {it.valor_produto.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Input
                              type="text"
                              maxLength={4}
                              value={it.cfop_entrada}
                              onChange={(e) =>
                                handleAtualizarItem(it.idTemp, 'cfop_entrada', e.target.value)
                              }
                              className="h-7 w-20 text-center text-xs font-mono"
                              title="CFOP de entrada escriturado"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Input
                              type="text"
                              maxLength={3}
                              value={it.cst_icms_entrada}
                              onChange={(e) =>
                                handleAtualizarItem(it.idTemp, 'cst_icms_entrada', e.target.value)
                              }
                              className="h-7 w-16 text-center text-xs font-mono"
                              title="CST ICMS de entrada"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.valor_icms}
                              onChange={(e) =>
                                handleAtualizarItem(
                                  it.idTemp,
                                  'valor_icms',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-7 w-24 text-right text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.valor_ipi}
                              onChange={(e) =>
                                handleAtualizarItem(
                                  it.idTemp,
                                  'valor_ipi',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-7 w-24 text-right text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={it.valor_icms_st}
                              onChange={(e) =>
                                handleAtualizarItem(
                                  it.idTemp,
                                  'valor_icms_st',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-7 w-24 text-right text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoverItem(it.idTemp)}
                              className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              title="Remover item"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA 3: TOTAIS E RATEIOS ================= */}
        <TabsContent value="totais" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Despesas Adicionais Globais */}
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-blue-600" />
                  Despesas e Descontos Globais
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Valor do Frete (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={freteGlobal || ''}
                      onChange={(e) => setFreteGlobal(parseFloat(e.target.value) || 0)}
                      className="text-xs h-9 font-mono font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Valor do Seguro (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={seguroGlobal || ''}
                      onChange={(e) => setSeguroGlobal(parseFloat(e.target.value) || 0)}
                      className="text-xs h-9 font-mono font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Outras Despesas (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={outrasGlobal || ''}
                      onChange={(e) => setOutrasGlobal(parseFloat(e.target.value) || 0)}
                      className="text-xs h-9 font-mono font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Desconto Total (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={descontoGlobal || ''}
                      onChange={(e) => setDescontoGlobal(parseFloat(e.target.value) || 0)}
                      className="text-xs h-9 font-mono font-medium text-rose-600"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRatearDespesasNosItens}
                    disabled={itens.length === 0}
                    className="w-full text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                  >
                    <Calculator size={14} />
                    Ratear Despesas Proporcionalmente nos Itens
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Resumo Consolidado dos Totais */}
            <Card className="border-slate-200 shadow-xs bg-slate-50/30">
              <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-emerald-600" />
                  Resumo Geral da Nota Fiscal
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total dos Produtos:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    R$ {totaisCalculados.valorProdutos.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Frete:</span>
                  <span className="font-mono text-slate-800">
                    R$ {totaisCalculados.valorFrete.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Seguro:</span>
                  <span className="font-mono text-slate-800">
                    R$ {totaisCalculados.valorSeguro.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Outras Despesas:</span>
                  <span className="font-mono text-slate-800">
                    R$ {totaisCalculados.valorOutras.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Valor do IPI:</span>
                  <span className="font-mono text-slate-800">
                    R$ {totaisCalculados.valorIpi.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) ICMS ST / FCP ST:</span>
                  <span className="font-mono text-slate-800">
                    R$ {(totaisCalculados.valorIcmsSt + totaisCalculados.valorFcpSt).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
                  <span>(-) Desconto:</span>
                  <span className="font-mono">R$ {totaisCalculados.valorDesconto.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-slate-300 text-sm font-bold text-slate-900 bg-white p-2 rounded">
                  <span>VALOR TOTAL DA NOTA:</span>
                  <span className="font-mono text-blue-700">
                    R$ {totaisCalculados.valorTotal.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= ABA 4: CONDIÇÃO E PARCELAS ================= */}
        <TabsContent value="parcelas" className="space-y-4">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Condição de Pagamento e Faturas
                </CardTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Gere as parcelas automaticamente com a condição de pagamento ou adicione
                  manualmente os vencimentos.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Condição de Pagamento
                  </Label>
                  <SelectCondicaoPagamento
                    value={condicaoPagamentoId}
                    onChange={(val) => setCondicaoPagamentoId(val)}
                    uso="Compras"
                    placeholder="Selecione a condição de pagamento..."
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleGerarParcelas}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 gap-1.5"
                >
                  <Sparkles size={14} />
                  Gerar Parcelas Automaticamente
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAdicionarParcelaManual}
                  className="text-xs h-9 gap-1.5"
                >
                  <Plus size={14} />
                  Adicionar Parcela Manual
                </Button>
              </div>

              {/* Tabela de Parcelas */}
              {parcelas.length === 0 ? (
                <div className="py-8 text-center text-slate-400 border border-dashed rounded-lg">
                  <DollarSign className="h-6 w-6 mx-auto mb-1 text-slate-300" />
                  <p className="text-xs">
                    Nenhuma parcela gerada ainda. Escolha a condição e clique em &quot;Gerar
                    Parcelas&quot;.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 px-3 w-20">Parcela</th>
                        <th className="py-2 px-3 w-40">Data de Vencimento</th>
                        <th className="py-2 px-3 w-36 text-right">Valor (R$)</th>
                        <th className="py-2 px-3">Forma de Pagamento</th>
                        <th className="py-2 px-3 w-16 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parcelas.map((parc, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-700">
                            {parc.numero}
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="date"
                              value={parc.data_vencimento}
                              onChange={(e) =>
                                handleAtualizarParcela(idx, 'data_vencimento', e.target.value)
                              }
                              className="h-8 text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={parc.valor}
                              onChange={(e) =>
                                handleAtualizarParcela(
                                  idx,
                                  'valor',
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="h-8 text-right text-xs font-mono font-semibold"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Select
                              value={parc.forma_pagamento || '15'}
                              onValueChange={(val) =>
                                handleAtualizarParcela(idx, 'forma_pagamento', val)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="01">01 - Dinheiro</SelectItem>
                                <SelectItem value="02">02 - Cheque</SelectItem>
                                <SelectItem value="03">03 - Cartão de Crédito</SelectItem>
                                <SelectItem value="04">04 - Cartão de Débito</SelectItem>
                                <SelectItem value="15">15 - Boleto Bancário</SelectItem>
                                <SelectItem value="16">16 - Depósito Bancário</SelectItem>
                                <SelectItem value="17">17 - PIX</SelectItem>
                                <SelectItem value="99">99 - Outros</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoverParcela(idx)}
                              className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default NotaEntradaDigitacaoPage
