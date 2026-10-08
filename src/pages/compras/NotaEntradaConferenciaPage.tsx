import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  FileText,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  CreditCard,
  Layers,
  Percent,
  Receipt,
  FileCode,
  Copy,
  Check,
  Ban,
  Clock,
  Printer,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  NotaEntrada,
  NotaEntradaItem,
  NotaEntradaParcela,
  obterNotaEntradaPorId,
  lancarNotaEntrada,
  cancelarNotaEntrada,
  vincularPedidoNotaEntrada,
  ItemRevisaoPreco,
  calcularCreditosItem,
  calcularCustoAquisicaoItem,
  sugerirCstPisCofinsEntrada,
  tentarVincularItemAutomatico,
  executarVinculoAutomaticoNota,
  vincularProdutoAoItemNota,
} from '@/services/notasEntrada'
import {
  listarPedidosCompra,
  obterPedidoCompraPorId,
  PedidoCompraCompleto,
  PedidoCompra,
} from '@/services/pedidosCompra'
import {
  salvarProdutoFornecedor,
  obterProdutoPorId,
  salvarProduto,
  Produto,
} from '@/services/produtos'
import { TIPOS_ENTRADA, TipoEntradaNota, converterCfopEntrada } from '@/services/cfopConversao'
import { sugerirTributacao, SugestaoFiscalResultado } from '@/services/motorFiscal'
import { aliquotaInterestadual } from '@/services/icmsMatriz'
import { obterConfigFiscalEmpresa } from '@/services/configFiscal'
import { ModalProdutosNaoCadastrados } from '@/components/compras/ModalProdutosNaoCadastrados'
import { ModalConferenciaFiscalItem } from '@/components/compras/ModalConferenciaFiscalItem'
import { SelectCfop } from '@/components/SelectCfop'
import { SelectProduto } from '@/components/SelectProduto'
import { ProdutoCadastroRapido } from '@/components/ProdutoCadastroRapido'
import { formatarCNPJ, formatarCPF } from '@/lib/validacoes'
import pb from '@/lib/pocketbase/client'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Unlink,
  Link2,
  Sparkles,
  RefreshCw,
  Search,
  Plus,
  HelpCircle,
  Truck,
  Calculator,
} from 'lucide-react'

export const NotaEntradaConferenciaPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { pode } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()

  const podeEditar = pode('notas_entrada', 'editar')
  const podeCancelar = pode('notas_entrada', 'excluir')

  const [nota, setNota] = useState<NotaEntrada | null>(null)
  const [itens, setItens] = useState<NotaEntradaItem[]>([])
  const [parcelas, setParcelas] = useState<NotaEntradaParcela[]>([])
  const [carregando, setCarregando] = useState(true)
  const [conteudoXmlTexto, setConteudoXmlTexto] = useState<string>('')
  const [copiadoXml, setCopiadoXml] = useState(false)
  const [processandoAcao, setProcessandoAcao] = useState(false)

  // Frete à parte (CT-e)
  const [fretePagoParte, setFretePagoParte] = useState(false)
  const [valorFreteParte, setValorFreteParte] = useState<number>(0)

  // Modais de Vínculo de Produto
  const [modalBuscaAberto, setModalBuscaAberto] = useState(false)
  const [modalCriacaoAberto, setModalCriacaoAberto] = useState(false)
  const [itemSelecionadoParaVinculo, setItemSelecionadoParaVinculo] =
    useState<NotaEntradaItem | null>(null)

  // Dialog Cancelar
  const [cancelarModalAberto, setCancelarModalAberto] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)

  // Vínculo com Pedido de Compra
  const [pedidosFornecedor, setPedidosFornecedor] = useState<PedidoCompra[]>([])
  const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoCompraCompleto | null>(null)
  const [carregandoPedidos, setCarregandoPedidos] = useState(false)

  // Lançamento da Nota
  const [modalLancarAberto, setModalLancarAberto] = useState(false)
  const [atualizarCustoProdutos, setAtualizarCustoProdutos] = useState(true)
  const [justificativaDivergencia, setJustificativaDivergencia] = useState('')
  const [precisaJustificativaDivergencia, setPrecisaJustificativaDivergencia] = useState(false)
  const [valorDivergenciaItens, setValorDivergenciaItens] = useState(0)
  const [lancando, setLancando] = useState(false)

  // Modal de Revisão de Preços (pós-lançamento)
  const [modalRevisaoPrecosAberto, setModalRevisaoPrecosAberto] = useState(false)
  const [itensRevisao, setItensRevisao] = useState<ItemRevisaoPreco[]>([])
  const [precosEditados, setPrecosEditados] = useState<Record<string, number>>({})
  const [salvandoPrecos, setSalvandoPrecos] = useState(false)

  // Etapa 0.0.30: Cadastro Automático e Motor Fiscal
  const [modalLoteNaoCadastradosAberto, setModalLoteNaoCadastradosAberto] = useState(false)
  const [mapaSugestoesFiscais, setMapaSugestoesFiscais] = useState<
    Record<string, SugestaoFiscalResultado>
  >({})
  const [modalFiscalItemAberto, setModalFiscalItemAberto] = useState(false)
  const [itemFiscalSelecionado, setItemFiscalSelecionado] = useState<NotaEntradaItem | null>(null)
  const [aliquotasInterestaduaisEsperadas, setAliquotasInterestaduaisEsperadas] = useState<
    Record<string, number>
  >({})
  const [aliqInternaEsConfig, setAliqInternaEsConfig] = useState<number>(17)

  const carregarDados = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    try {
      const dados = await obterNotaEntradaPorId(id)
      setNota(dados.nota)
      setItens(dados.itens)
      setParcelas(dados.parcelas)

      // Carregar conteúdo do XML para a aba XML
      if (dados.nota.xml_arquivo) {
        try {
          const fileUrl = pb.files.getURL(dados.nota, dados.nota.xml_arquivo)
          const resp = await fetch(fileUrl)
          if (resp.ok) {
            const txt = await resp.text()
            setConteudoXmlTexto(txt)
          }
        } catch {
          // fallback
        }
      }
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar nota de entrada',
        description: err instanceof Error ? err.message : 'Falha ao buscar nota',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [id, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Vínculo automático e verificação de criação automática ao abrir a conferência
  useEffect(() => {
    if (!nota || !itens.length || carregando) return

    let ativo = true
    const verificarVinculosECadastro = async () => {
      try {
        const itensSemProduto = itens.filter((i) => !i.produto_id)
        if (itensSemProduto.length > 0) {
          const res = await executarVinculoAutomaticoNota(
            nota.id,
            nota.fornecedor_id,
            empresaAtiva as any,
            nota.tipo_entrada,
          )
          if (res.vinculados > 0 && ativo) {
            toast({
              title: 'Vínculo automático aplicado',
              description: `${res.vinculados} item(ns) vinculado(s) automaticamente pelo catálogo/histórico.`,
            })
            await carregarDados()
            return
          }
        }

        // Se após o vínculo automático ainda sobrarem itens sem produto
        const restantesSemProduto = itens.filter((i) => !i.produto_id)
        if (restantesSemProduto.length > 0 && empresaAtiva?.id && ativo) {
          const configFiscal = await obterConfigFiscalEmpresa(empresaAtiva.id)
          const modoCriacao = configFiscal?.criar_produtos_automaticamente || 'Perguntar'

          if (modoCriacao === 'Perguntar') {
            setModalLoteNaoCadastradosAberto(true)
          } else if (modoCriacao === 'Sempre') {
            // Criação automática imediata
            const { processarCadastroAutomaticoProdutos } =
              await import('@/services/cadastroAutomaticoProdutos')
            const linhasAuto = restantesSemProduto.map((it) => ({
              itemNota: it,
              criar: true,
              descricao: (it.descricao_fornecedor || '').slice(0, 120),
              unidadeCompra: it.unidade_xml || 'UN',
              unidadeVendaId: '',
              fatorConversao: 1,
              precoCusto: it.custo_unitario_estoque || it.valor_unitario_xml || 0,
              margemPercentual: configFiscal?.margem_padrao_percentual || 50,
              precoVenda: 0,
              ncm: it.ncm_xml || '',
              cest: it.cest_xml || '',
              gtin: it.codigo_barras_xml || '',
            }))

            await processarCadastroAutomaticoProdutos({
              notaId: nota.id,
              notaInfo: {
                modelo: String(nota.modelo || '55'),
                serie: String(nota.serie || '1'),
                numero: String(nota.numero || ''),
                fornecedorNome: nota.expand?.fornecedor_id?.razao_social || '',
                dataEmissao: nota.data_emissao,
              },
              fornecedorId: nota.fornecedor_id,
              empresa: empresaAtiva as any,
              itensParaProcessar: linhasAuto,
              grupoId: configFiscal?.grupo_padrao_id,
              categoriaId: configFiscal?.categoria_padrao_id,
              margemPadrao: configFiscal?.margem_padrao_percentual || 50,
              aplicarClassificacaoFiscal: true,
              tipoEntrada: nota.tipo_entrada,
              ufFornecedor: nota.expand?.fornecedor_id?.uf,
            })

            toast({
              title: 'Produtos cadastrados automaticamente',
              description: `${restantesSemProduto.length} produto(s) criado(s) e vinculado(s) com sucesso.`,
            })
            await carregarDados()
          }
        }
      } catch (err) {
        console.warn('Erro ao processar vínculos e criação automática:', err)
      }
    }

    verificarVinculosECadastro()

    return () => {
      ativo = false
    }
  }, [nota?.id, nota?.fornecedor_id, nota?.tipo_entrada, itens.length, empresaAtiva, carregando])

  // Avaliação do Motor Fiscal para cada item e cálculo da Matriz Interestadual
  useEffect(() => {
    if (!itens.length || !empresaAtiva) return

    let ativo = true
    const avaliarFiscais = async () => {
      const novoMapa: Record<string, SugestaoFiscalResultado> = {}
      const novoMapaAliqInter: Record<string, number> = {}

      const configFisc = empresaAtiva.id ? await obterConfigFiscalEmpresa(empresaAtiva.id) : null
      const aliqEs = configFisc?.aliquota_icms_interna_padrao ?? 17
      setAliqInternaEsConfig(aliqEs)

      const ufForn = (nota?.expand?.fornecedor_id?.uf || '').toUpperCase().trim()
      const ufEmp = (empresaAtiva.uf || 'ES').toUpperCase().trim()

      for (const it of itens) {
        try {
          const itemSimulado = {
            ncm: it.ncm_xml || it.ncm_fornecedor,
            cest: it.cest_xml || it.cest_fornecedor,
            origem: it.origem_mercadoria_xml || '0',
            cstIcms: it.cst_icms_fornecedor,
            cfop: it.cfop_fornecedor,
            cstPis: it.cst_pis_fornecedor,
            cstCofins: it.cst_cofins_fornecedor,
          }

          const sug = await sugerirTributacao({
            itemXml: itemSimulado,
            empresa: empresaAtiva as any,
            produtoExistente: it.expand?.produto_id as Partial<Produto> | undefined,
            tipoEntrada: nota?.tipo_entrada,
            ufFornecedor: ufForn,
          })
          novoMapa[it.id] = sug

          // Comparação da Matriz de ICMS Interestadual
          if (ufForn && ufEmp && ufForn !== ufEmp) {
            const esperada = await aliquotaInterestadual(
              ufForn,
              ufEmp,
              it.origem_mercadoria_xml || '0',
            )
            novoMapaAliqInter[it.id] = esperada
          }
        } catch (errSug) {
          console.warn('Erro ao avaliar sugestao item', it.id, errSug)
        }
      }

      if (ativo) {
        setMapaSugestoesFiscais(novoMapa)
        setAliquotasInterestaduaisEsperadas(novoMapaAliqInter)
      }
    }

    avaliarFiscais()

    return () => {
      ativo = false
    }
  }, [itens, empresaAtiva, nota?.tipo_entrada, nota?.expand?.fornecedor_id?.uf])

  // ==========================================
  // HANDLERS DE ALTERAÇÃO FISCAL E PRODUTOS
  // ==========================================

  // Recalcular custos e rateios de toda a nota (incluindo frete à parte do CT-e se informado)
  const recalcularTudo = useCallback(
    async (tipoEntradaParam?: TipoEntradaNota, freteCTeParam?: number) => {
      if (!nota || !itens.length) return
      setProcessandoAcao(true)

      try {
        const tipoEntrada = tipoEntradaParam || nota.tipo_entrada || 'Compra para revenda'
        const freteCTe = freteCTeParam !== undefined ? freteCTeParam : valorFreteParte

        const somaProdutos = itens.reduce((acc, i) => acc + (i.valor_produto || 0), 0) || 1

        // Rateio de despesas do cabeçalho que não vieram nos itens
        const somaFreteItens = itens.reduce((acc, i) => acc + (i.valor_frete || 0), 0)
        const freteCabecalhoNaoRateado = Math.max(0, (nota.valor_frete || 0) - somaFreteItens)

        const somaSeguroItens = itens.reduce((acc, i) => acc + (i.valor_seguro || 0), 0)
        const seguroCabecalhoNaoRateado = Math.max(0, (nota.valor_seguro || 0) - somaSeguroItens)

        const somaOutrasItens = itens.reduce((acc, i) => acc + (i.valor_outras || 0), 0)
        const outrasCabecalhoNaoRateado = Math.max(
          0,
          (nota.valor_outras_despesas || 0) - somaOutrasItens,
        )

        for (const it of itens) {
          const proporcao = (it.valor_produto || 0) / somaProdutos

          const freteEfetivo =
            (it.valor_frete || 0) +
            freteCabecalhoNaoRateado * proporcao +
            (freteCTe > 0 ? freteCTe * proporcao : 0)

          const seguroEfetivo = (it.valor_seguro || 0) + seguroCabecalhoNaoRateado * proporcao
          const outrasEfetivo = (it.valor_outras || 0) + outrasCabecalhoNaoRateado * proporcao

          const creditos = calcularCreditosItem({
            empresa: empresaAtiva as any,
            tipoEntrada,
            cstFornecedor: it.cst_icms_fornecedor,
            valorIcmsItem: it.valor_icms || 0,
            valorIpiItem: it.valor_ipi || 0,
            valorProduto: it.valor_produto || 0,
            desconto: it.valor_desconto || 0,
            frete: freteEfetivo,
            seguro: seguroEfetivo,
            outras: outrasEfetivo,
            cstPisEntrada: it.cst_pis_entrada,
            cstCofinsEntrada: it.cst_cofins_entrada,
            aproveitaCreditoIcms: it.aproveita_credito_icms,
            aproveitaCreditoIpi: it.aproveita_credito_ipi,
          })

          const qtdEstoque =
            it.quantidade_estoque ||
            Number(((it.quantidade_fornecedor || 0) * (it.fator_conversao || 1)).toFixed(4))

          const { custoTotalItem, custoUnitarioEstoque } = calcularCustoAquisicaoItem({
            valorProduto: it.valor_produto || 0,
            valorDesconto: it.valor_desconto || 0,
            valorFrete: freteEfetivo,
            valorSeguro: seguroEfetivo,
            valorOutras: outrasEfetivo,
            valorIpi: it.valor_ipi || 0,
            valorIcmsSt: it.valor_icms_st || 0,
            valorFcpSt: it.valor_fcp_st || 0,
            valorCreditoIcms: creditos.valorCreditoIcms,
            valorCreditoIpi: creditos.valorCreditoIpi,
            valorCreditoPis: creditos.valorCreditoPis,
            valorCreditoCofins: creditos.valorCreditoCofins,
            quantidadeEstoque: qtdEstoque,
          })

          await pb.collection('notas_entrada_itens').update(it.id, {
            valor_credito_icms: creditos.valorCreditoIcms,
            valor_credito_ipi: creditos.valorCreditoIpi,
            valor_credito_pis: creditos.valorCreditoPis,
            valor_credito_cofins: creditos.valorCreditoCofins,
            custo_total_item: custoTotalItem,
            custo_unitario_estoque: custoUnitarioEstoque,
            updated_by: pb.authStore.record?.id || null,
          })
        }

        // Atualiza cabeçalho da nota
        const novosItens = await pb.collection('notas_entrada_itens').getFullList<NotaEntradaItem>({
          filter: `nota_id = '${nota.id}' && ativo = true`,
          sort: 'numero_item',
          expand: 'produto_id.unidade_id',
        })

        const totalCredIcms = novosItens.reduce((acc, i) => acc + (i.valor_credito_icms || 0), 0)
        const totalCredIpi = novosItens.reduce((acc, i) => acc + (i.valor_credito_ipi || 0), 0)
        const totalCredPis = novosItens.reduce((acc, i) => acc + (i.valor_credito_pis || 0), 0)
        const totalCredCofins = novosItens.reduce(
          (acc, i) => acc + (i.valor_credito_cofins || 0),
          0,
        )
        const totalCustoNota = novosItens.reduce((acc, i) => acc + (i.custo_total_item || 0), 0)

        const notaAtualizada = await pb.collection('notas_entrada').update<NotaEntrada>(nota.id, {
          tipo_entrada: tipoEntrada,
          credito_icms: Number(totalCredIcms.toFixed(2)),
          credito_ipi: Number(totalCredIpi.toFixed(2)),
          credito_pis: Number(totalCredPis.toFixed(2)),
          credito_cofins: Number(totalCredCofins.toFixed(2)),
          custo_total: Number(totalCustoNota.toFixed(2)),
          updated_by: pb.authStore.record?.id || null,
        })

        setNota(notaAtualizada)
        setItens(novosItens)
        toast({ title: 'Cálculos fiscais e de custo atualizados!' })
      } catch (err: unknown) {
        toast({
          title: 'Erro ao recalcular',
          description: err instanceof Error ? err.message : 'Falha nos cálculos fiscais',
          variant: 'destructive',
        })
      } finally {
        setProcessandoAcao(false)
      }
    },
    [nota, itens, valorFreteParte, empresaAtiva, toast],
  )

  // Mudar Tipo de Entrada da Nota
  const handleMudarTipoEntrada = async (novoTipo: TipoEntradaNota) => {
    if (!nota) return
    setProcessandoAcao(true)
    try {
      // Atualizar CFOP de entrada de cada item baseado no novo tipo de entrada
      for (const it of itens) {
        if (it.cfop_fornecedor) {
          const resConv = await converterCfopEntrada(it.cfop_fornecedor, novoTipo)
          await pb.collection('notas_entrada_itens').update(it.id, {
            cfop_entrada: resConv.cfopEntrada,
          })
        }
      }

      await recalcularTudo(novoTipo)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao alterar tipo de entrada',
        description: err instanceof Error ? err.message : 'Falha na conversão de CFOPs',
        variant: 'destructive',
      })
      setProcessandoAcao(false)
    }
  }

  // Vincular produto manualmente
  const handleVincularProdutoManual = async (item: NotaEntradaItem, produtoId: string) => {
    setProcessandoAcao(true)
    try {
      const prod = await obterProdutoPorId(produtoId)
      if (!prod) throw new Error('Produto não encontrado')

      const fator = item.fator_conversao && item.fator_conversao > 0 ? item.fator_conversao : 1

      await vincularProdutoAoItemNota(
        item.id,
        prod.id,
        fator,
        empresaAtiva as any,
        nota?.tipo_entrada || 'Compra para revenda',
      )

      // Gravar / atualizar produtos_fornecedores para a próxima nota vir vinculada
      if (nota?.fornecedor_id) {
        try {
          await salvarProdutoFornecedor({
            produto_id: prod.id,
            fornecedor_id: nota.fornecedor_id,
            codigo_no_fornecedor: item.codigo_fornecedor || '',
            descricao_no_fornecedor: item.descricao_fornecedor || prod.descricao,
            unidade_fornecedor: item.unidade_fornecedor || 'UN',
            fator_conversao: fator,
            ultimo_preco_compra: item.valor_unitario_fornecedor,
            data_ultima_compra: nota.data_emissao || new Date().toISOString().slice(0, 10),
          })
        } catch (errPf) {
          console.warn('Falha ao atualizar produtos_fornecedores:', errPf)
        }
      }

      toast({
        title: 'Produto vinculado com sucesso!',
        description: `${prod.descricao} associado ao item #${item.numero_item}. Histórico gravado para próximas notas.`,
      })

      setModalBuscaAberto(false)
      setItemSelecionadoParaVinculo(null)
      await carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao vincular produto',
        description: err instanceof Error ? err.message : 'Falha na associação',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Desvincular produto do item
  const handleDesvincularProduto = async (item: NotaEntradaItem) => {
    setProcessandoAcao(true)
    try {
      await pb.collection('notas_entrada_itens').update(item.id, {
        produto_id: null,
        fator_conversao: 1,
        quantidade_estoque: item.quantidade_fornecedor,
        custo_total_item: item.valor_produto,
        custo_unitario_estoque: item.valor_unitario_fornecedor,
        updated_by: pb.authStore.record?.id || null,
      })
      toast({
        title: 'Vínculo removido',
        description: `O item #${item.numero_item} agora está sem produto do ERP.`,
      })
      await carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao desvincular',
        description: err instanceof Error ? err.message : 'Falha ao remover vínculo',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Alteração de campos do item na tabela (fator conversão, CFOP, CST, créditos, lote, validade)
  const handleAtualizarItemInline = async (
    item: NotaEntradaItem,
    campos: Partial<NotaEntradaItem>,
  ) => {
    try {
      let qtdEstoque = item.quantidade_estoque
      let fator = item.fator_conversao || 1

      if (campos.fator_conversao !== undefined) {
        fator = campos.fator_conversao > 0 ? campos.fator_conversao : 1
        qtdEstoque = Number((item.quantidade_fornecedor * fator).toFixed(4))
        campos.quantidade_estoque = qtdEstoque
      }

      // Se alterou algum valor fiscal ou crédito, recalcula custos
      const cstPis =
        campos.cst_pis_entrada !== undefined ? campos.cst_pis_entrada : item.cst_pis_entrada
      const cstCofins =
        campos.cst_cofins_entrada !== undefined
          ? campos.cst_cofins_entrada
          : item.cst_cofins_entrada
      const aproveitaIcms =
        campos.aproveita_credito_icms !== undefined
          ? campos.aproveita_credito_icms
          : item.aproveita_credito_icms
      const aproveitaIpi =
        campos.aproveita_credito_ipi !== undefined
          ? campos.aproveita_credito_ipi
          : item.aproveita_credito_ipi

      const creditos = calcularCreditosItem({
        empresa: empresaAtiva as any,
        tipoEntrada: nota?.tipo_entrada || 'Compra para revenda',
        cstFornecedor: item.cst_icms_fornecedor,
        valorIcmsItem: item.valor_icms || 0,
        valorIpiItem: item.valor_ipi || 0,
        valorProduto: item.valor_produto || 0,
        desconto: item.valor_desconto || 0,
        frete: item.valor_frete || 0,
        seguro: item.valor_seguro || 0,
        outras: item.valor_outras || 0,
        cstPisEntrada: cstPis,
        cstCofinsEntrada: cstCofins,
        aproveitaCreditoIcms: aproveitaIcms,
        aproveitaCreditoIpi: aproveitaIpi,
      })

      const { custoTotalItem, custoUnitarioEstoque } = calcularCustoAquisicaoItem({
        valorProduto: item.valor_produto || 0,
        valorDesconto: item.valor_desconto || 0,
        valorFrete: item.valor_frete || 0,
        valorSeguro: item.valor_seguro || 0,
        valorOutras: item.valor_outras || 0,
        valorIpi: item.valor_ipi || 0,
        valorIcmsSt: item.valor_icms_st || 0,
        valorFcpSt: item.valor_fcp_st || 0,
        valorCreditoIcms: creditos.valorCreditoIcms,
        valorCreditoIpi: creditos.valorCreditoIpi,
        valorCreditoPis: creditos.valorCreditoPis,
        valorCreditoCofins: creditos.valorCreditoCofins,
        quantidadeEstoque: qtdEstoque,
      })

      const payloadAtualizar: any = {
        ...campos,
        fator_conversao: fator,
        quantidade_estoque: qtdEstoque,
        valor_credito_icms: creditos.valorCreditoIcms,
        valor_credito_ipi: creditos.valorCreditoIpi,
        valor_credito_pis: creditos.valorCreditoPis,
        valor_credito_cofins: creditos.valorCreditoCofins,
        custo_total_item: custoTotalItem,
        custo_unitario_estoque: custoUnitarioEstoque,
        updated_by: pb.authStore.record?.id || null,
      }

      await pb.collection('notas_entrada_itens').update(item.id, payloadAtualizar)

      // Atualiza estado local
      setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...payloadAtualizar } : i)))
    } catch (err: unknown) {
      toast({
        title: 'Erro ao atualizar item',
        description: err instanceof Error ? err.message : 'Falha na atualização',
        variant: 'destructive',
      })
    }
  }

  // ==========================================
  // AVISOS DE AUDITORIA E CONFERÊNCIA
  // ==========================================
  const avisos = React.useMemo(() => {
    if (!nota) return []
    const lista: { tipo: 'aviso' | 'alerta'; texto: string }[] = []

    // 1. Fornecedor não cadastrado
    if (!nota.fornecedor_id) {
      lista.push({
        tipo: 'alerta',
        texto: 'Fornecedor ainda não vinculado/cadastrado no ERP para esta nota fiscal.',
      })
    }

    // 2. Itens sem produto vinculado
    const semProduto = itens.filter((i) => !i.produto_id)
    if (semProduto.length > 0) {
      lista.push({
        tipo: 'aviso',
        texto: `${semProduto.length} item(ns) ainda sem produto do catálogo vinculado. Vincule ou crie o produto antes de efetivar o lançamento.`,
      })
    }

    // 3. NCM divergente entre fornecedor e produto cadastrado
    for (const it of itens) {
      if (it.expand?.produto_id?.ncm && it.ncm_fornecedor) {
        const ncmProd = it.expand.produto_id.ncm.replace(/\D/g, '')
        const ncmForn = it.ncm_fornecedor.replace(/\D/g, '')
        if (ncmProd && ncmForn && ncmProd !== ncmForn) {
          lista.push({
            tipo: 'aviso',
            texto: `Item #${it.numero_item} (${it.descricao_fornecedor}): NCM da nota (${it.ncm_fornecedor}) difere do NCM cadastrado no produto (${it.expand.produto_id.ncm}).`,
          })
        }
      }
    }

    // 4. Validação de Lote e Validade
    for (const it of itens) {
      if (it.expand?.produto_id?.controla_lote_validade) {
        if (!it.lote_numero || !it.lote_validade) {
          lista.push({
            tipo: 'alerta',
            texto: `Item #${it.numero_item} vinculado ao produto "${it.expand.produto_id.descricao}" exige controle de Lote e Data de Validade.`,
          })
        }
      }
    }

    // 5. Parcela criada automaticamente
    if (
      parcelas.length === 1 &&
      parcelas[0].numero === '001' &&
      parcelas[0].forma_pagamento === '99'
    ) {
      lista.push({
        tipo: 'aviso',
        texto:
          'Parcela única gerada automaticamente com valor total na data de emissão (XML sem grupo de duplicatas).',
      })
    }

    // 6. Divergência de totais
    const somaItens = itens.reduce((acc, i) => acc + (i.valor_produto || 0), 0)
    const diff = Math.abs(somaItens - (nota.valor_produtos || 0))
    if (diff > 0.05 && itens.length > 0) {
      lista.push({
        tipo: 'alerta',
        texto: `A soma dos produtos dos itens (R$ ${somaItens.toFixed(2)}) diverge do total de produtos declarado na nota (R$ ${nota.valor_produtos?.toFixed(2)}).`,
      })
    }

    return lista
  }, [nota, itens, parcelas])

  // ==========================================
  // RESUMO FISCAL SPED C190 (Aba Totais)
  // ==========================================
  const resumoSpedC190 = React.useMemo(() => {
    // Agrupamento por CFOP entrada + CST ICMS entrada + Alíquota ICMS
    const mapa = new Map<
      string,
      {
        cfop: string
        cst: string
        aliquota: number
        valorOperacao: number
        baseIcms: number
        valorIcms: number
        baseIcmsSt: number
        valorIcmsSt: number
        valorIpi: number
      }
    >()

    for (const it of itens) {
      const cfop = it.cfop_entrada || it.cfop_fornecedor || '0000'
      const cst = it.cst_icms_entrada || it.cst_icms_fornecedor || '00'
      const aliq = it.aliquota_icms || 0
      const chave = `${cfop}_${cst}_${aliq.toFixed(2)}`

      const valorOp =
        (it.valor_produto || 0) -
        (it.valor_desconto || 0) +
        (it.valor_frete || 0) +
        (it.valor_seguro || 0) +
        (it.valor_outras || 0) +
        (it.valor_ipi || 0) +
        (it.valor_icms_st || 0)

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          cfop,
          cst,
          aliquota: aliq,
          valorOperacao: valorOp,
          baseIcms: it.base_icms || 0,
          valorIcms: it.valor_icms || 0,
          baseIcmsSt: it.base_icms_st || 0,
          valorIcmsSt: it.valor_icms_st || 0,
          valorIpi: it.valor_ipi || 0,
        })
      } else {
        const itemExistente = mapa.get(chave)!
        itemExistente.valorOperacao += valorOp
        itemExistente.baseIcms += it.base_icms || 0
        itemExistente.valorIcms += it.valor_icms || 0
        itemExistente.baseIcmsSt += it.base_icms_st || 0
        itemExistente.valorIcmsSt += it.valor_icms_st || 0
        itemExistente.valorIpi += it.valor_ipi || 0
      }
    }

    return Array.from(mapa.values())
  }, [itens])

  const copiarChave = (chave: string) => {
    navigator.clipboard.writeText(chave)
    toast({ title: 'Chave de acesso copiada!' })
  }

  const copiarXml = () => {
    if (!conteudoXmlTexto) return
    navigator.clipboard.writeText(conteudoXmlTexto)
    setCopiadoXml(true)
    setTimeout(() => setCopiadoXml(false), 2000)
    toast({ title: 'Conteúdo do XML copiado!' })
  }

  // Carregar pedidos do fornecedor para o seletor de vínculo
  useEffect(() => {
    if (!nota?.fornecedor_id || !empresaAtiva?.id) return
    let ativo = true

    const carregarPedidos = async () => {
      setCarregandoPedidos(true)
      try {
        const res = await listarPedidosCompra({
          empresaId: empresaAtiva.id,
          fornecedorId: nota.fornecedor_id,
          itensPorPagina: 50,
        })
        if (ativo) {
          // Filtrar apenas pedidos com status "Enviado" ou "Parcialmente recebido",
          // ou o pedido que já estiver vinculado à nota
          const pedidosFiltrados = res.items.filter(
            (p) =>
              p.status === 'Enviado' ||
              p.status === 'Parcialmente recebido' ||
              p.id === nota.pedido_compra_id,
          )
          setPedidosFornecedor(pedidosFiltrados)
        }
      } catch (err) {
        console.warn('Erro ao listar pedidos do fornecedor:', err)
      } finally {
        if (ativo) setCarregandoPedidos(false)
      }
    }

    carregarPedidos()
    return () => {
      ativo = false
    }
  }, [nota?.fornecedor_id, nota?.pedido_compra_id, empresaAtiva?.id])

  // Carregar detalhes do pedido vinculado atual
  useEffect(() => {
    if (!nota?.pedido_compra_id) {
      setPedidoSelecionado(null)
      return
    }
    let ativo = true
    const carregarDetalhePedido = async () => {
      try {
        const ped = await obterPedidoCompraPorId(nota.pedido_compra_id!)
        if (ativo) setPedidoSelecionado(ped)
      } catch (err) {
        console.warn('Erro ao carregar pedido de compra vinculado:', err)
      }
    }
    carregarDetalhePedido()
    return () => {
      ativo = false
    }
  }, [nota?.pedido_compra_id])

  // Handler para vincular/alterar pedido de compra
  const handleVincularPedido = async (novoPedidoId: string) => {
    if (!nota) return
    const idFinal = novoPedidoId === 'nenhum' ? null : novoPedidoId
    setProcessandoAcao(true)
    try {
      await vincularPedidoNotaEntrada(nota.id, idFinal)
      toast({
        title: idFinal ? 'Pedido de compra vinculado' : 'Vínculo com pedido removido',
        description: idFinal
          ? 'Itens e quantidades serão comparados com o pedido selecionado.'
          : 'A nota não está mais associada a nenhum pedido.',
      })
      await carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao vincular pedido',
        description: err instanceof Error ? err.message : 'Falha na atualização',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcao(false)
    }
  }

  // Mapa de itens do pedido para comparação rápida por produto_id
  const mapaItensPedido = React.useMemo(() => {
    if (!pedidoSelecionado)
      return new Map<
        string,
        { quantidade: number; custo_unitario: number; quantidade_recebida: number }
      >()
    const mapa = new Map<
      string,
      { quantidade: number; custo_unitario: number; quantidade_recebida: number }
    >()
    for (const it of pedidoSelecionado.itens) {
      mapa.set(it.produto_id, {
        quantidade: it.quantidade,
        custo_unitario: it.custo_unitario,
        quantidade_recebida: it.quantidade_recebida || 0,
      })
    }
    return mapa
  }, [pedidoSelecionado])

  // Iniciar fluxo de lançamento com validações prévias
  const handleIniciarLancamento = async () => {
    if (!nota) return

    // 1. Fornecedor cadastrado
    if (!nota.fornecedor_id) {
      toast({
        title: 'Fornecedor obrigatório',
        description: 'Vincule um fornecedor cadastrado antes de efetivar o lançamento da nota.',
        variant: 'destructive',
      })
      return
    }

    // 2. Todos os itens com produto vinculado, fator e CFOP
    for (const it of itens) {
      if (!it.produto_id) {
        toast({
          title: `Item #${it.numero_item} sem produto`,
          description: 'Todos os itens precisam estar vinculados a um produto do catálogo.',
          variant: 'destructive',
        })
        return
      }
      if (!it.fator_conversao || it.fator_conversao <= 0) {
        toast({
          title: `Item #${it.numero_item} com fator inválido`,
          description: 'Informe um fator de conversão válido maior que zero.',
          variant: 'destructive',
        })
        return
      }
      if (!it.cfop_entrada) {
        toast({
          title: `Item #${it.numero_item} sem CFOP de entrada`,
          description: 'Defina o CFOP de escrituração de entrada para todos os itens.',
          variant: 'destructive',
        })
        return
      }

      // Validação de lote e validade se controla lote
      const prod = it.expand?.produto_id
      if (prod?.controla_lote_validade) {
        if (!it.lote_numero?.trim() || !it.lote_validade?.trim()) {
          toast({
            title: `Lote obrigatório no item #${it.numero_item}`,
            description: `O produto "${prod.descricao}" exige controle de lote e data de validade. Preencha antes de lançar.`,
            variant: 'destructive',
          })
          return
        }
      }
    }

    // 3. Validação data de entrada >= data de emissão
    if (nota.data_emissao && nota.data_entrada && nota.data_entrada < nota.data_emissao) {
      toast({
        title: 'Data de entrada inválida',
        description: 'A data de entrada não pode ser anterior à data de emissão da nota.',
        variant: 'destructive',
      })
      return
    }

    // 4. Validação parcelas vs total (exceto Bonificação)
    if (nota.tipo_entrada !== 'Bonificação') {
      const somaParcelas = parcelas.reduce((acc, p) => acc + (p.valor || 0), 0)
      const diffParcelas = Math.abs(somaParcelas - (nota.valor_total || 0))
      if (diffParcelas > 0.05 && parcelas.length > 0) {
        toast({
          title: 'Divergência nas parcelas',
          description: `A soma das parcelas (R$ ${somaParcelas.toFixed(2)}) difere do total da nota (R$ ${nota.valor_total.toFixed(2)}) em mais de R$ 0,05.`,
          variant: 'destructive',
        })
        return
      }
    }

    // 5. Validação da soma dos itens vs total da nota
    const somaItens = itens.reduce((acc, i) => acc + (i.valor_produto || 0), 0)
    const diffItens = Math.abs(somaItens - (nota.valor_total || 0))
    if (diffItens > 0.05) {
      setPrecisaJustificativaDivergencia(true)
      setValorDivergenciaItens(diffItens)
    } else {
      setPrecisaJustificativaDivergencia(false)
      setValorDivergenciaItens(0)
    }

    // Se nota não tiver parcelas, carrega contas financeiras e formas de pagamento da empresa para opção "Já paga"
    if (parcelas.length === 0 && nota.empresa_id) {
      try {
        const contas = await pb
          .collection('contas_financeiras')
          .getFullList<{ id: string; nome: string; conta_padrao_pagamentos?: boolean }>({
            filter: `empresa_id = '${nota.empresa_id}' && ativo = true`,
            sort: 'nome',
          })
        setContasFinanceirasDisponiveis(contas.map((c) => ({ id: c.id, nome: c.nome })))
        const padrao = contas.find((c) => c.conta_padrao_pagamentos)
        if (padrao) setContaPagamentoId(padrao.id)
        else if (contas[0]) setContaPagamentoId(contas[0].id)

        const formas = await pb
          .collection('formas_pagamento')
          .getFullList<{ id: string; descricao: string }>({
            filter: 'ativo = true',
            sort: 'descricao',
          })
        setFormasPagamentoDisponiveis(formas)
        if (formas[0]) setFormaPagamentoId(formas[0].id)
      } catch {
        /* intentionally ignored */
      }
    }

    setModalLancarAberto(true)
  }

  // Estado para opção "Já paga" na nota sem parcelas
  const [jaPaga, setJaPaga] = useState(false)
  const [contaPagamentoId, setContaPagamentoId] = useState('')
  const [formaPagamentoId, setFormaPagamentoId] = useState('')
  const [contasFinanceirasDisponiveis, setContasFinanceirasDisponiveis] = useState<
    { id: string; nome: string }[]
  >([])
  const [formasPagamentoDisponiveis, setFormasPagamentoDisponiveis] = useState<
    { id: string; descricao: string }[]
  >([])

  // Confirmar Lançamento Efetivo
  const handleConfirmarLancamento = async () => {
    if (!nota) return
    if (precisaJustificativaDivergencia && !justificativaDivergencia.trim()) {
      toast({
        title: 'Justificativa obrigatória',
        description:
          'Como há divergência entre a soma dos itens e o total da nota, informe o motivo para prosseguir.',
        variant: 'destructive',
      })
      return
    }

    if (parcelas.length === 0 && jaPaga && !contaPagamentoId) {
      toast({
        title: 'Conta financeira obrigatória',
        description: 'Selecione a conta bancária para efetivar a baixa imediata da nota.',
        variant: 'destructive',
      })
      return
    }

    setLancando(true)
    try {
      const res = await lancarNotaEntrada({
        notaId: nota.id,
        atualizarCustoProdutos,
        justificativaDivergencia,
        usuarioErpId: pb.authStore.record?.id,
        jaPaga: parcelas.length === 0 ? jaPaga : false,
        contaPagamentoId: parcelas.length === 0 && jaPaga ? contaPagamentoId : undefined,
        formaPagamentoId: parcelas.length === 0 && jaPaga ? formaPagamentoId : undefined,
      })

      setModalLancarAberto(false)
      toast({
        title: 'Nota de entrada lançada com sucesso!',
        description: 'Estoque movimentado, custos calculados e nota bloqueada para edição.',
      })

      // Se houver produtos cuja margem ficou abaixo da margem padrão, abre Revisão de Preços
      if (res.produtos_revisao && res.produtos_revisao.length > 0) {
        setItensRevisao(res.produtos_revisao)
        const mapaPrecos: Record<string, number> = {}
        for (const itemRev of res.produtos_revisao) {
          mapaPrecos[itemRev.produto_id] = Number(itemRev.preco_sugerido.toFixed(2))
        }
        setPrecosEditados(mapaPrecos)
        setModalRevisaoPrecosAberto(true)
      }

      await carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao lançar nota',
        description: err instanceof Error ? err.message : 'Falha ao processar lançamento',
        variant: 'destructive',
      })
    } finally {
      setLancando(false)
    }
  }

  // Salvar preços na revisão de preços
  const handleSalvarPrecosRevisao = async () => {
    setSalvandoPrecos(true)
    try {
      for (const itemRev of itensRevisao) {
        const novoPreco = precosEditados[itemRev.produto_id]
        if (novoPreco !== undefined && novoPreco > 0) {
          await salvarProduto({
            id: itemRev.produto_id,
            preco_venda: novoPreco,
          })
        }
      }
      toast({
        title: 'Preços de venda atualizados com sucesso!',
        description: 'Os novos preços foram gravados no catálogo de produtos.',
      })
      setModalRevisaoPrecosAberto(false)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao atualizar preços',
        description: err instanceof Error ? err.message : 'Falha ao gravar preços',
        variant: 'destructive',
      })
    } finally {
      setSalvandoPrecos(false)
    }
  }

  const handleCancelarNota = async () => {
    if (!nota || !motivoCancelamento.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe uma justificativa para o cancelamento da nota de entrada.',
        variant: 'destructive',
      })
      return
    }

    setCancelando(true)
    try {
      const res = await cancelarNotaEntrada(nota.id, motivoCancelamento)
      toast({
        title: 'Nota cancelada com sucesso',
        description: res.message || 'Status atualizado para Cancelada e movimentos estornados.',
      })
      setCancelarModalAberto(false)
      await carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Cancelamento não permitido',
        description: err instanceof Error ? err.message : 'Falha ao processar cancelamento',
        variant: 'destructive',
      })
    } finally {
      setCancelando(false)
    }
  }

  if (carregando) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="inline-block animate-spin h-7 w-7 border-4 border-blue-600 border-t-transparent rounded-full mb-3" />
        <p className="text-sm">Carregando dados da nota de entrada...</p>
      </div>
    )
  }

  if (!nota) {
    return (
      <div className="py-16 text-center">
        <h3 className="text-lg font-semibold text-slate-800">Nota de entrada não encontrada</h3>
        <p className="text-sm text-slate-500 mt-1">
          O registro solicitado pode ter sido excluído ou a empresa ativa é diferente.
        </p>
        <Button
          onClick={() => navigate('/compras/notas-entrada')}
          className="mt-4"
          variant="outline"
        >
          Voltar para listagem
        </Button>
      </div>
    )
  }

  const statusBadgeClass =
    nota.status === 'Lançada'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : nota.status === 'Cancelada'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/compras/notas-entrada')}
              className="h-8 w-8 text-slate-500"
            >
              <ArrowLeft size={16} />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Nota de Entrada #{nota.numero}
              <Badge variant="outline" className={`text-xs ${statusBadgeClass}`}>
                {nota.status}
              </Badge>
              <Badge variant="outline" className="text-xs border-slate-300 font-mono">
                Mod {nota.modelo} - Série {nota.serie}
              </Badge>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-10">
            Fornecedor:{' '}
            <strong className="text-slate-800">
              {nota.expand?.fornecedor_id?.razao_social ||
                nota.expand?.fornecedor_id?.nome_fantasia ||
                'Não cadastrado'}
            </strong>{' '}
            • Emissão: {nota.data_emissao} • Entrada: {nota.data_entrada}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Se a nota estiver Lançada, o botão Cancelar Lançamento fica visível para quem tem permissão excluir */}
          {nota.status === 'Lançada' && podeCancelar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMotivoCancelamento('')
                setCancelarModalAberto(true)
              }}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5 font-medium"
            >
              <Ban size={14} />
              Cancelar Lançamento
            </Button>
          )}

          {/* Se a nota estiver Em conferência, o botão de cancelar nota também pode ser usado */}
          {nota.status === 'Em conferência' && podeCancelar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMotivoCancelamento('')
                setCancelarModalAberto(true)
              }}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
            >
              <Ban size={14} />
              Cancelar Nota
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="text-slate-700 gap-1.5"
          >
            <Printer size={14} />
            Imprimir Espelho
          </Button>

          {/* Botão Lançar nota (apenas quando status for 'Em conferência' e tiver permissão editar) */}
          {nota.status === 'Em conferência' && (
            <Button
              size="sm"
              onClick={handleIniciarLancamento}
              disabled={!podeEditar || processandoAcao}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium shadow-sm"
            >
              <CheckCircle2 size={14} />
              Lançar nota
            </Button>
          )}

          {nota.status === 'Lançada' && (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs py-1 px-2.5">
              <CheckCircle2 size={13} className="text-emerald-600" />
              Nota Lançada (Somente Leitura)
            </Badge>
          )}

          {nota.status === 'Cancelada' && (
            <Badge className="bg-rose-100 text-rose-800 border-rose-300 gap-1 text-xs py-1 px-2.5">
              <Ban size={13} className="text-rose-600" />
              Nota Cancelada
            </Badge>
          )}
        </div>
      </div>

      {/* Chave de Acesso */}
      {nota.chave_acesso && (
        <div className="bg-slate-100/80 px-4 py-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Chave de Acesso:</span>
            <code className="font-mono text-slate-800 font-semibold tracking-wider">
              {nota.chave_acesso}
            </code>
          </div>
          <div className="flex items-center gap-2">
            {nota.protocolo_autorizacao && (
              <Badge variant="outline" className="bg-white border-slate-300 text-[11px]">
                Protocolo: {nota.protocolo_autorizacao}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copiarChave(nota.chave_acesso!)}
              className="h-7 text-xs text-blue-600 hover:text-blue-700 gap-1"
            >
              <Copy size={12} />
              Copiar
            </Button>
          </div>
        </div>
      )}

      {/* Avisos no Topo */}
      {avisos.length > 0 && (
        <div className="space-y-2">
          {avisos.map((aviso, idx) => (
            <Alert
              key={idx}
              className={`py-2 text-xs ${
                aviso.tipo === 'alerta'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                  : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}
            >
              <AlertTriangle
                className={`h-4 w-4 ${aviso.tipo === 'alerta' ? 'text-rose-600' : 'text-amber-600'}`}
              />
              <AlertDescription className="font-medium">{aviso.texto}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Abas de Conferência */}
      <Tabs defaultValue="itens" className="w-full">
        <TabsList className="bg-slate-100 p-1 border border-slate-200">
          <TabsTrigger value="cabecalho" className="text-xs gap-1.5">
            <Building2 size={13} />
            Cabeçalho
          </TabsTrigger>
          <TabsTrigger value="itens" className="text-xs gap-1.5">
            <Package size={13} />
            Itens ({itens.length})
          </TabsTrigger>
          <TabsTrigger value="totais" className="text-xs gap-1.5">
            <Receipt size={13} />
            Totais & Impostos
          </TabsTrigger>
          <TabsTrigger value="parcelas" className="text-xs gap-1.5">
            <CreditCard size={13} />
            Parcelas ({parcelas.length})
          </TabsTrigger>
          <TabsTrigger value="informacoes" className="text-xs gap-1.5">
            <FileText size={13} />
            Informações Adicionais
          </TabsTrigger>
          <TabsTrigger value="xml" className="text-xs gap-1.5">
            <FileCode size={13} />
            XML Formatado
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA CABEÇALHO ================= */}
        <TabsContent value="cabecalho" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Dados do Fornecedor Emitente
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Razão Social:</span>
                  <span className="col-span-2 font-medium text-slate-800">
                    {nota.expand?.fornecedor_id?.razao_social || 'Fornecedor não vinculado'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Nome Fantasia:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.expand?.fornecedor_id?.nome_fantasia || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">CNPJ / CPF:</span>
                  <span className="col-span-2 font-mono text-slate-800">
                    {nota.expand?.fornecedor_id?.cpf_cnpj
                      ? nota.expand.fornecedor_id.tipo_pessoa === 'Física'
                        ? formatarCPF(nota.expand.fornecedor_id.cpf_cnpj)
                        : formatarCNPJ(nota.expand.fornecedor_id.cpf_cnpj)
                      : '—'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Inscrição Estadual:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.expand?.fornecedor_id?.inscricao_estadual || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Município / UF:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.expand?.fornecedor_id?.municipio || '—'} -{' '}
                    {nota.expand?.fornecedor_id?.uf || '—'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Dados Fiscais do Documento
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Origem Lançamento:</span>
                  <span className="col-span-2 font-medium">
                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                      {nota.origem_lancamento}
                    </Badge>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <span className="text-slate-500 font-semibold">Tipo de Entrada:</span>
                  <div className="col-span-2">
                    <Select
                      value={nota.tipo_entrada}
                      onValueChange={(val) => handleMudarTipoEntrada(val as TipoEntradaNota)}
                      disabled={nota.status !== 'Em conferência' || !podeEditar || processandoAcao}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white font-semibold text-blue-700 border-blue-200">
                        <SelectValue placeholder="Selecione o tipo de entrada" />
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
                {/* Seletor de Vínculo com Pedido de Compra */}
                <div className="grid grid-cols-3 gap-2 items-center bg-blue-50/50 p-2 rounded-md border border-blue-100">
                  <span className="text-blue-900 font-semibold flex items-center gap-1">
                    <Package size={13} className="text-blue-600" />
                    Pedido de compra:
                  </span>
                  <div className="col-span-2 flex items-center gap-2">
                    <Select
                      value={nota.pedido_compra_id || 'nenhum'}
                      onValueChange={handleVincularPedido}
                      disabled={
                        nota.status !== 'Em conferência' ||
                        !podeEditar ||
                        processandoAcao ||
                        carregandoPedidos
                      }
                    >
                      <SelectTrigger className="h-8 text-xs bg-white border-blue-200">
                        <SelectValue placeholder="Selecione um pedido deste fornecedor..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum" className="text-xs text-slate-500">
                          Nenhum pedido vinculado
                        </SelectItem>
                        {pedidosFornecedor.map((ped) => (
                          <SelectItem key={ped.id} value={ped.id} className="text-xs">
                            Pedido #{ped.numero} ({ped.status}) - R${' '}
                            {(ped.valor_total || 0).toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Natureza da Operação:</span>
                  <span className="col-span-2 text-slate-800">{nota.natureza_operacao || '—'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Data de Emissão:</span>
                  <span className="col-span-2 text-slate-800">{nota.data_emissao}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Data de Entrada:</span>
                  <span className="col-span-2 text-slate-800">{nota.data_entrada}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Modalidade de Frete:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.modalidade_frete === 0
                      ? '0 - Por conta do emitente (CIF)'
                      : nota.modalidade_frete === 1
                        ? '1 - Por conta do destinatário (FOB)'
                        : nota.modalidade_frete === 2
                          ? '2 - Terceiros'
                          : nota.modalidade_frete === 9
                            ? '9 - Sem frete'
                            : String(nota.modalidade_frete)}
                  </span>
                </div>

                {/* Opção Frete pago à parte (CT-e) */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="frete_pago_parte"
                      checked={fretePagoParte}
                      onCheckedChange={(checked) => {
                        const ativo = Boolean(checked)
                        setFretePagoParte(ativo)
                        if (!ativo) {
                          setValorFreteParte(0)
                          recalcularTudo(undefined, 0)
                        }
                      }}
                      disabled={nota.status !== 'Em conferência' || !podeEditar}
                    />
                    <label
                      htmlFor="frete_pago_parte"
                      className="text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5"
                    >
                      <Truck className="h-3.5 w-3.5 text-blue-600" />
                      Frete pago à parte (CT-e recebido separadamente)
                    </label>
                  </div>

                  {fretePagoParte && (
                    <div className="mt-2 pl-6 flex items-center gap-2">
                      <Label className="text-[11px] text-slate-600">
                        Valor do Frete CT-e (R$):
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorFreteParte || ''}
                        onChange={(e) => setValorFreteParte(parseFloat(e.target.value) || 0)}
                        className="w-32 h-7 text-xs font-mono font-medium"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => recalcularTudo(undefined, valorFreteParte)}
                        disabled={processandoAcao}
                        className="h-7 text-xs gap-1"
                      >
                        <Calculator className="h-3 w-3" />
                        Ratear no Custo
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= ABA ITENS ================= */}
        <TabsContent value="itens" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span>
                Conferência individual dos itens: dados do fornecedor, de-para do catálogo,
                tributação de entrada e custo unitário apurado.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!nota) return
                  setProcessandoAcao(true)
                  try {
                    const res = await executarVinculoAutomaticoNota(
                      nota.id,
                      nota.fornecedor_id,
                      empresaAtiva as any,
                      nota.tipo_entrada,
                    )
                    toast({
                      title: 'Vínculo automático executado',
                      description: `${res.vinculados} item(ns) vinculado(s) de ${res.total}.`,
                    })
                    await carregarDados()
                  } finally {
                    setProcessandoAcao(false)
                  }
                }}
                disabled={processandoAcao || nota.status !== 'Em conferência'}
                className="h-7 text-xs gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
              >
                <RefreshCw className={`h-3 w-3 ${processandoAcao ? 'animate-spin' : ''}`} />
                Reprocessar Vínculos Automáticos
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {itens.map((item) => {
              const prod = item.expand?.produto_id
              const ncmDivergente =
                prod?.ncm &&
                item.ncm_fornecedor &&
                prod.ncm.replace(/\D/g, '') !== item.ncm_fornecedor.replace(/\D/g, '')

              // Alertas de ST e CEST
              const cestDivergente =
                prod?.cest &&
                item.cest_fornecedor &&
                prod.cest.replace(/\D/g, '') !== item.cest_fornecedor.replace(/\D/g, '')

              const stFornecedor =
                ['10', '30', '60', '70'].includes(item.cst_icms_fornecedor || '') ||
                ['201', '202', '203', '500'].includes(item.cst_icms_fornecedor || '') ||
                ['5401', '5403', '5405', '6401', '6403', '6404'].includes(
                  (item.cfop_fornecedor || '').replace(/\D/g, ''),
                )

              const stProduto =
                ['10', '30', '60', '70'].includes(prod?.cst_icms || '') ||
                ['201', '202', '203', '500'].includes(prod?.csosn || '') ||
                ['5405', '6404'].includes(prod?.cfop_venda_interna || '')

              const stDivergente = prod && stFornecedor !== stProduto

              // Alíquota interestadual e DIFAL
              const aliqEsperada = aliquotasInterestaduaisEsperadas[item.id]
              const aliqXml = item.aliquota_icms || 0
              const divergenciaAliqInter =
                aliqEsperada !== undefined && aliqXml > 0 && Math.abs(aliqXml - aliqEsperada) > 0.01

              const ehUsoConsumoOuAtivo =
                nota.tipo_entrada === 'Uso e consumo' || nota.tipo_entrada === 'Ativo imobilizado'

              const valorDifalEstimado =
                ehUsoConsumoOuAtivo && aliqEsperada !== undefined
                  ? Number(
                      (
                        (item.base_icms || item.valor_produto || 0) *
                        ((aliqInternaEsConfig - aliqEsperada) / 100)
                      ).toFixed(2),
                    )
                  : 0

              const sugestaoFiscal = mapaSugestoesFiscais[item.id]
              const confianca = sugestaoFiscal?.confianca || 'Baixa'
              const seloCor =
                confianca === 'Alta'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : confianca === 'Média'
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'

              const exigeLote = Boolean(prod?.controla_lote_validade)
              const lotePendente = exigeLote && (!item.lote_numero || !item.lote_validade)

              return (
                <Card
                  key={item.id}
                  className={`border transition-all overflow-hidden ${
                    !prod
                      ? 'border-amber-300 bg-amber-50/20'
                      : lotePendente
                        ? 'border-rose-300 bg-rose-50/20'
                        : 'border-slate-200'
                  }`}
                >
                  <CardHeader className="py-2.5 px-4 bg-slate-50/80 border-b border-slate-200 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="font-mono text-xs bg-white text-slate-700"
                      >
                        Item #{item.numero_item}
                      </Badge>
                      <span className="font-semibold text-slate-900 text-xs">
                        {item.descricao_fornecedor}
                      </span>

                      {/* Destaque de divergência com Pedido de Compra se vinculado */}
                      {(() => {
                        if (!pedidoSelecionado || !item.produto_id) return null
                        const itemPed = mapaItensPedido.get(item.produto_id)
                        if (!itemPed) {
                          return (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-purple-50 text-purple-700 border-purple-300"
                            >
                              Fora do Pedido #{pedidoSelecionado.numero}
                            </Badge>
                          )
                        }

                        const qtdNota =
                          item.quantidade_estoque ||
                          item.quantidade_fornecedor * (item.fator_conversao || 1)
                        const precoNota =
                          item.custo_unitario_estoque || item.valor_unitario_fornecedor
                        const diffQtd = qtdNota - itemPed.quantidade
                        const diffPreco = precoNota - itemPed.custo_unitario

                        const divergenteQtd = Math.abs(diffQtd) > 0.001
                        const divergentePreco = Math.abs(diffPreco) > 0.01

                        if (!divergenteQtd && !divergentePreco) {
                          return (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300"
                            >
                              Pedido #{pedidoSelecionado.numero}: Qtd e Preço iguais
                            </Badge>
                          )
                        }

                        return (
                          <div className="flex items-center gap-1">
                            {divergenteQtd && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  diffQtd > 0
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-rose-50 text-rose-800 border-rose-300'
                                }`}
                                title={`Qtd pedida: ${itemPed.quantidade} | Qtd nota: ${qtdNota}`}
                              >
                                {diffQtd > 0
                                  ? `Qtd +${diffQtd.toFixed(2)}`
                                  : `Qtd ${diffQtd.toFixed(2)}`}{' '}
                                vs Pedido
                              </Badge>
                            )}
                            {divergentePreco && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  diffPreco > 0
                                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                }`}
                                title={`Preço pedido: R$ ${itemPed.custo_unitario.toFixed(2)} | Preço nota: R$ ${precoNota.toFixed(2)}`}
                              >
                                Preço{' '}
                                {diffPreco > 0
                                  ? `+R$ ${diffPreco.toFixed(2)}`
                                  : `-R$ ${Math.abs(diffPreco).toFixed(2)}`}{' '}
                                vs Pedido
                              </Badge>
                            )}
                          </div>
                        )
                      })()}
                      {item.codigo_fornecedor && (
                        <span className="text-[11px] text-slate-500 font-mono">
                          (Cód. Forn: {item.codigo_fornecedor})
                        </span>
                      )}

                      {/* Selo Fiscal por Item */}
                      <Badge
                        variant="outline"
                        onClick={() => {
                          setItemFiscalSelecionado(item)
                          setModalFiscalItemAberto(true)
                        }}
                        className={`cursor-pointer transition-colors text-[10px] gap-1 py-0.5 px-2 ${seloCor}`}
                        title="Clique para ver detalhes do enquadramento fiscal sugerido"
                      >
                        <Sparkles className="h-3 w-3" />
                        Fiscal: {confianca} (
                        {sugestaoFiscal?.motivoGeral || 'Classificar manualmente'})
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      {prod ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDesvincularProduto(item)}
                          disabled={
                            nota.status !== 'Em conferência' || !podeEditar || processandoAcao
                          }
                          className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1"
                        >
                          <Unlink className="h-3 w-3" />
                          Desvincular
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setItemSelecionadoParaVinculo(item)
                              setModalBuscaAberto(true)
                            }}
                            disabled={
                              nota.status !== 'Em conferência' || !podeEditar || processandoAcao
                            }
                            className="h-7 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 gap-1"
                          >
                            <Search className="h-3 w-3" />
                            Vincular Produto
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setItemSelecionadoParaVinculo(item)
                              setModalCriacaoAberto(true)
                            }}
                            disabled={
                              nota.status !== 'Em conferência' || !podeEditar || processandoAcao
                            }
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Criar Produto do Item
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3 text-xs">
                    {/* Alertas específicos do item com botões para atualizar produto */}
                    {ncmDivergente && (
                      <Alert className="py-1.5 px-3 bg-amber-50 border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-[11px]">
                            <strong>Aviso Fiscal:</strong> NCM da nota (
                            <code>{item.ncm_fornecedor}</code>) diverge do produto cadastrado (
                            <code>{prod?.ncm}</code>).
                          </span>
                        </div>
                        {podeEditar && prod && nota.status === 'Em conferência' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                            onClick={async () => {
                              await pb.collection('produtos').update(prod.id, {
                                ncm: item.ncm_fornecedor,
                              })
                              toast({
                                title: `NCM do produto atualizado para ${item.ncm_fornecedor}`,
                              })
                              await carregarDados()
                            }}
                          >
                            Atualizar NCM com o dado do XML
                          </Button>
                        )}
                      </Alert>
                    )}

                    {stDivergente && (
                      <Alert className="py-1.5 px-3 bg-amber-50 border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-[11px]">
                            <strong>Aviso ST:</strong>{' '}
                            {stFornecedor
                              ? 'Fornecedor enviou com ST, mas o produto no ERP está cadastrado sem ST.'
                              : 'Fornecedor enviou sem ST, mas o produto no ERP está cadastrado com ST.'}
                          </span>
                        </div>
                        {podeEditar && prod && nota.status === 'Em conferência' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                            onClick={async () => {
                              const ehSimples = empresaAtiva?.regime_apuracao === 'Simples Nacional'
                              const upd: Record<string, any> = {}
                              if (stFornecedor) {
                                if (ehSimples) upd.csosn = '500'
                                else upd.cst_icms = '60'
                                upd.cfop_venda_interna = '5405'
                              } else {
                                if (ehSimples) upd.csosn = '102'
                                else upd.cst_icms = '00'
                                upd.cfop_venda_interna = '5102'
                              }
                              await pb.collection('produtos').update(prod.id, upd)
                              toast({ title: 'Tributação de ST do produto atualizada com o XML' })
                              await carregarDados()
                            }}
                          >
                            Atualizar ST do produto
                          </Button>
                        )}
                      </Alert>
                    )}

                    {cestDivergente && (
                      <Alert className="py-1.5 px-3 bg-amber-50 border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <span className="text-[11px]">
                            <strong>Aviso CEST:</strong> CEST da nota (
                            <code>{item.cest_fornecedor}</code>) diverge do cadastrado (
                            <code>{prod?.cest}</code>).
                          </span>
                        </div>
                        {podeEditar && prod && nota.status === 'Em conferência' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                            onClick={async () => {
                              await pb.collection('produtos').update(prod.id, {
                                cest: item.cest_fornecedor,
                              })
                              toast({
                                title: `CEST do produto atualizado para ${item.cest_fornecedor}`,
                              })
                              await carregarDados()
                            }}
                          >
                            Atualizar CEST com o dado do XML
                          </Button>
                        )}
                      </Alert>
                    )}

                    {divergenciaAliqInter && (
                      <Alert className="py-1.5 px-3 bg-blue-50 border-blue-300 text-blue-900 text-xs flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="text-[11px]">
                          <strong>Alíquota Interestadual Diferente:</strong> Fornecedor destacou{' '}
                          {aliqXml}% de ICMS, enquanto a Matriz Interestadual prevê {aliqEsperada}%.
                          Confirme com o contador.
                        </span>
                      </Alert>
                    )}

                    {ehUsoConsumoOuAtivo && valorDifalEstimado > 0 && (
                      <Alert className="py-1.5 px-3 bg-purple-50 border-purple-300 text-purple-900 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                          <span className="text-[11px]">
                            <strong>Estimativa de DIFAL:</strong> Base R${' '}
                            {(item.base_icms || item.valor_produto || 0).toFixed(2)} × (
                            {aliqInternaEsConfig}% ES − {aliqEsperada}% Inter) ={' '}
                            <strong>R$ {valorDifalEstimado.toFixed(2)}</strong>.
                          </span>
                        </div>
                        <span className="text-[10px] text-purple-700 font-medium italic">
                          Possível DIFAL a recolher: confirme com o contador
                        </span>
                      </Alert>
                    )}

                    {lotePendente && (
                      <Alert className="py-1.5 px-3 bg-rose-50 border-rose-300 text-rose-900 text-xs flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        <span className="text-[11px]">
                          <strong>Atenção:</strong> O produto exige controle de lote e data de
                          validade. Preencha os campos abaixo antes de lançar a nota.
                        </span>
                      </Alert>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* LADO ESQUERDO: Dados do Fornecedor */}
                      <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-200 space-y-2">
                        <h4 className="font-semibold text-slate-700 text-[11px] uppercase tracking-wide border-b border-slate-200 pb-1">
                          Dados da Nota (Fornecedor)
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-500">Cód. Fornecedor:</span>{' '}
                            <span className="font-mono text-slate-800">
                              {item.codigo_fornecedor || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">GTIN/EAN:</span>{' '}
                            <span className="font-mono text-slate-800">
                              {item.gtin_fornecedor || 'SEM GTIN'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">NCM / CEST:</span>{' '}
                            <span className="font-mono text-slate-800">
                              {item.ncm_fornecedor || '—'}{' '}
                              {item.cest_fornecedor ? `(${item.cest_fornecedor})` : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">CFOP Fornec.:</span>{' '}
                            <span className="font-mono text-slate-800">
                              {item.cfop_fornecedor || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Unidade / Qtd:</span>{' '}
                            <span className="font-mono font-bold text-slate-800">
                              {item.quantidade_fornecedor} {item.unidade_fornecedor}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Valor Unit.:</span>{' '}
                            <span className="font-mono text-slate-800">
                              R$ {item.valor_unitario_fornecedor.toFixed(2)}
                            </span>
                          </div>
                          <div className="col-span-2 pt-1 border-t border-slate-200 flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Subtotal Item:</span>
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              R${' '}
                              {(
                                item.valor_produto ||
                                item.quantidade_fornecedor * item.valor_unitario_fornecedor
                              ).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* LADO DIREITO: Produto Vinculado no ERP & Conversão */}
                      <div className="p-3 bg-blue-50/30 rounded-lg border border-blue-200 space-y-2">
                        <h4 className="font-semibold text-blue-900 text-[11px] uppercase tracking-wide border-b border-blue-200 pb-1">
                          Vínculo e Estoque (ERP)
                        </h4>

                        {prod ? (
                          <div className="space-y-2 text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900">
                                [{prod.codigo}] {prod.descricao}
                              </span>
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]"
                              >
                                Vinculado
                              </Badge>
                            </div>

                            {/* Oferta de preenchimento de campos fiscais vazios se aplicável */}
                            {(!prod.ncm ||
                              (!prod.cst_icms && !prod.csosn) ||
                              !prod.cfop_venda_interna) && (
                              <div className="p-2 bg-amber-50/60 border border-amber-200 rounded flex items-center justify-between">
                                <span className="text-[10px] text-amber-900">
                                  Produto vinculado possui campos fiscais não preenchidos.
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px] bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                                  onClick={() => {
                                    setItemFiscalSelecionado(item)
                                    setModalFiscalItemAberto(true)
                                  }}
                                >
                                  Preencher com Sugestão Fiscal
                                </Button>
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-2 items-center">
                              <div>
                                <Label className="text-[10px] text-slate-500">Unidade ERP</Label>
                                <div className="font-mono font-bold text-slate-800">
                                  {prod.expand?.unidade_id?.sigla || 'UN'}
                                </div>
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">
                                  Fator Conversão
                                </Label>
                                <Input
                                  type="number"
                                  step="0.0001"
                                  min="0.0001"
                                  value={item.fator_conversao || 1}
                                  onChange={(e) =>
                                    handleAtualizarItemInline(item, {
                                      fator_conversao: parseFloat(e.target.value) || 1,
                                    })
                                  }
                                  disabled={nota.status !== 'Em conferência' || !podeEditar}
                                  className="h-7 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">Qtd. Estoque</Label>
                                <div className="font-mono font-bold text-blue-700 text-xs">
                                  {(
                                    item.quantidade_estoque ||
                                    item.quantidade_fornecedor * (item.fator_conversao || 1)
                                  ).toFixed(2)}{' '}
                                  {prod.expand?.unidade_id?.sigla || 'UN'}
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-blue-100 flex justify-between items-center bg-blue-50/50 p-2 rounded">
                              <div>
                                <span className="text-[11px] text-slate-600">
                                  Custo Unitário Estoque:
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  (Líquido de créditos e rateios)
                                </div>
                              </div>
                              <span className="font-mono font-bold text-sm text-emerald-700">
                                R$ {(item.custo_unitario_estoque || 0).toFixed(4)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="py-4 text-center text-slate-500 space-y-2">
                            <Package className="h-6 w-6 text-amber-500 mx-auto" />
                            <p className="text-xs">Nenhum produto do ERP vinculado a este item.</p>
                            <p className="text-[10px] text-slate-400">
                              Vincule a um produto existente ou crie um novo para apurar o custo
                              unitário de estoque.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lotes e Validade se aplicável */}
                    {prod?.controla_lote_validade && (
                      <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200">
                        <h5 className="font-semibold text-amber-900 text-xs mb-2">
                          Rastreabilidade: Controle de Lote e Data de Validade *
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-[11px] text-slate-700">Número do Lote *</Label>
                            <Input
                              value={item.lote_numero || ''}
                              onChange={(e) =>
                                handleAtualizarItemInline(item, { lote_numero: e.target.value })
                              }
                              placeholder="Ex: LOTE-2025"
                              disabled={nota.status !== 'Em conferência' || !podeEditar}
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-slate-700">Data de Validade *</Label>
                            <Input
                              type="date"
                              value={item.lote_validade || ''}
                              onChange={(e) =>
                                handleAtualizarItemInline(item, { lote_validade: e.target.value })
                              }
                              disabled={nota.status !== 'Em conferência' || !podeEditar}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-slate-700">Data de Fabricação</Label>
                            <Input
                              type="date"
                              value={item.lote_fabricacao || ''}
                              onChange={(e) =>
                                handleAtualizarItemInline(item, { lote_fabricacao: e.target.value })
                              }
                              disabled={nota.status !== 'Em conferência' || !podeEditar}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* BLOCO FISCAL E ESCRITURAÇÃO (CFOP, CST, PIS/COFINS, CRÉDITOS) */}
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                        <span className="font-semibold text-slate-700 text-[11px] uppercase tracking-wide">
                          Escrituração Fiscal e Aproveitamento de Créditos
                        </span>
                        <span className="text-[10px] text-slate-500 italic">
                          Confirme com o contador o CST e CFOP de entrada usados na escrituração
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold text-slate-700">
                            CFOP Entrada
                          </Label>
                          <SelectCfop
                            value={item.cfop_entrada}
                            onChange={(val) =>
                              handleAtualizarItemInline(item, { cfop_entrada: val || '' })
                            }
                            tipoMovimento="Entrada"
                            disabled={nota.status !== 'Em conferência' || !podeEditar}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold text-slate-700">
                            CST ICMS Entrada
                          </Label>
                          <Input
                            value={item.cst_icms_entrada || ''}
                            onChange={(e) =>
                              handleAtualizarItemInline(item, { cst_icms_entrada: e.target.value })
                            }
                            placeholder="Ex: 000, 090"
                            maxLength={3}
                            disabled={nota.status !== 'Em conferência' || !podeEditar}
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold text-slate-700">
                            CST PIS Entrada
                          </Label>
                          <Input
                            value={item.cst_pis_entrada || ''}
                            onChange={(e) =>
                              handleAtualizarItemInline(item, { cst_pis_entrada: e.target.value })
                            }
                            placeholder="Ex: 50, 98"
                            maxLength={2}
                            disabled={nota.status !== 'Em conferência' || !podeEditar}
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold text-slate-700">
                            CST COFINS Entrada
                          </Label>
                          <Input
                            value={item.cst_cofins_entrada || ''}
                            onChange={(e) =>
                              handleAtualizarItemInline(item, {
                                cst_cofins_entrada: e.target.value,
                              })
                            }
                            placeholder="Ex: 50, 98"
                            maxLength={2}
                            disabled={nota.status !== 'Em conferência' || !podeEditar}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Créditos detalhados do item */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                        <div className="p-2 bg-white rounded border border-slate-200">
                          <div className="flex items-center space-x-1.5 mb-1">
                            <Checkbox
                              id={`cred_icms_${item.id}`}
                              checked={item.aproveita_credito_icms}
                              onCheckedChange={(c) =>
                                handleAtualizarItemInline(item, {
                                  aproveita_credito_icms: Boolean(c),
                                })
                              }
                              disabled={nota.status !== 'Em conferência' || !podeEditar}
                            />
                            <label
                              htmlFor={`cred_icms_${item.id}`}
                              className="text-[11px] font-medium text-slate-700 cursor-pointer"
                            >
                              Crédito ICMS
                            </label>
                          </div>
                          <div className="font-mono font-bold text-slate-800">
                            R$ {(item.valor_credito_icms || 0).toFixed(2)}
                          </div>
                        </div>

                        <div className="p-2 bg-white rounded border border-slate-200">
                          <div className="flex items-center space-x-1.5 mb-1">
                            <Checkbox
                              id={`cred_ipi_${item.id}`}
                              checked={item.aproveita_credito_ipi}
                              onCheckedChange={(c) =>
                                handleAtualizarItemInline(item, {
                                  aproveita_credito_ipi: Boolean(c),
                                })
                              }
                              disabled={nota.status !== 'Em conferência' || !podeEditar}
                            />
                            <label
                              htmlFor={`cred_ipi_${item.id}`}
                              className="text-[11px] font-medium text-slate-700 cursor-pointer"
                            >
                              Crédito IPI
                            </label>
                          </div>
                          <div className="font-mono font-bold text-slate-800">
                            R$ {(item.valor_credito_ipi || 0).toFixed(2)}
                          </div>
                        </div>

                        <div className="p-2 bg-white rounded border border-slate-200">
                          <div className="text-[11px] font-medium text-slate-600 mb-1">
                            Crédito PIS (1,65%)
                          </div>
                          <div className="font-mono font-bold text-slate-800">
                            R$ {(item.valor_credito_pis || 0).toFixed(2)}
                          </div>
                        </div>

                        <div className="p-2 bg-white rounded border border-slate-200">
                          <div className="text-[11px] font-medium text-slate-600 mb-1">
                            Crédito COFINS (7,6%)
                          </div>
                          <div className="font-mono font-bold text-slate-800">
                            R$ {(item.valor_credito_cofins || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ================= ABA TOTAIS & RESUMO FISCAL ================= */}
        <TabsContent value="totais" className="mt-4 space-y-4">
          {/* Card de Divergências entre Soma dos Itens e Cabeçalho XML */}
          {(() => {
            const somaProd = itens.reduce((acc, i) => acc + (i.valor_produto || 0), 0)
            const somaIcms = itens.reduce((acc, i) => acc + (i.valor_icms || 0), 0)
            const somaSt = itens.reduce((acc, i) => acc + (i.valor_icms_st || 0), 0)
            const somaIpi = itens.reduce((acc, i) => acc + (i.valor_ipi || 0), 0)
            const somaTotalItens = itens.reduce(
              (acc, i) =>
                acc +
                (i.valor_produto || 0) -
                (i.valor_desconto || 0) +
                (i.valor_frete || 0) +
                (i.valor_seguro || 0) +
                (i.valor_outras || 0) +
                (i.valor_ipi || 0) +
                (i.valor_icms_st || 0),
              0,
            )

            const diffProd = Math.abs(somaProd - (nota.valor_produtos || 0))
            const diffIcms = Math.abs(somaIcms - (nota.valor_icms || 0))
            const diffSt = Math.abs(somaSt - (nota.valor_icms_st || 0))
            const diffIpi = Math.abs(somaIpi - (nota.valor_ipi || 0))
            const diffTotal = Math.abs(somaTotalItens - (nota.valor_total || 0))

            return (
              <Card className="border-slate-200">
                <CardHeader className="py-2.5 px-4 bg-slate-50 border-b border-slate-100">
                  <CardTitle className="text-sm font-semibold text-slate-800 flex items-center justify-between">
                    <span>Conferência de Integridade: Soma dos Itens vs. Totais do XML</span>
                    {diffProd < 0.05 && diffTotal < 0.05 ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 font-normal text-xs">
                        Valores Batem Perfeitamente
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 border-amber-300 font-normal text-xs">
                        Divergências Detectadas
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 text-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-medium">
                          <th className="py-1.5 px-3">Campo Fiscal</th>
                          <th className="py-1.5 px-3 text-right">Declarado no XML</th>
                          <th className="py-1.5 px-3 text-right">Soma dos Itens</th>
                          <th className="py-1.5 px-3 text-right">Diferença</th>
                          <th className="py-1.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        <tr>
                          <td className="py-2 px-3 font-sans font-medium text-slate-800">
                            Valor dos Produtos
                          </td>
                          <td className="py-2 px-3 text-right">
                            R$ {(nota.valor_produtos || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right">R$ {somaProd.toFixed(2)}</td>
                          <td
                            className={`py-2 px-3 text-right ${diffProd > 0.05 ? 'text-rose-600 font-bold' : 'text-slate-500'}`}
                          >
                            R$ {(somaProd - (nota.valor_produtos || 0)).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {diffProd <= 0.05 ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200"
                              >
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-rose-700 bg-rose-50 border-rose-200"
                              >
                                Divergência
                              </Badge>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans font-medium text-slate-800">
                            ICMS Normal
                          </td>
                          <td className="py-2 px-3 text-right">
                            R$ {(nota.valor_icms || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right">R$ {somaIcms.toFixed(2)}</td>
                          <td
                            className={`py-2 px-3 text-right ${diffIcms > 0.05 ? 'text-rose-600 font-bold' : 'text-slate-500'}`}
                          >
                            R$ {(somaIcms - (nota.valor_icms || 0)).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {diffIcms <= 0.05 ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200"
                              >
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-rose-700 bg-rose-50 border-rose-200"
                              >
                                Divergência
                              </Badge>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans font-medium text-slate-800">
                            ICMS-ST
                          </td>
                          <td className="py-2 px-3 text-right">
                            R$ {(nota.valor_icms_st || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right">R$ {somaSt.toFixed(2)}</td>
                          <td
                            className={`py-2 px-3 text-right ${diffSt > 0.05 ? 'text-rose-600 font-bold' : 'text-slate-500'}`}
                          >
                            R$ {(somaSt - (nota.valor_icms_st || 0)).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {diffSt <= 0.05 ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200"
                              >
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-rose-700 bg-rose-50 border-rose-200"
                              >
                                Divergência
                              </Badge>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 font-sans font-medium text-slate-800">IPI</td>
                          <td className="py-2 px-3 text-right">
                            R$ {(nota.valor_ipi || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right">R$ {somaIpi.toFixed(2)}</td>
                          <td
                            className={`py-2 px-3 text-right ${diffIpi > 0.05 ? 'text-rose-600 font-bold' : 'text-slate-500'}`}
                          >
                            R$ {(somaIpi - (nota.valor_ipi || 0)).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {diffIpi <= 0.05 ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200"
                              >
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-rose-700 bg-rose-50 border-rose-200"
                              >
                                Divergência
                              </Badge>
                            )}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/60 font-bold">
                          <td className="py-2 px-3 font-sans text-slate-900">Total da Nota</td>
                          <td className="py-2 px-3 text-right text-blue-700">
                            R$ {(nota.valor_total || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right text-blue-700">
                            R$ {somaTotalItens.toFixed(2)}
                          </td>
                          <td
                            className={`py-2 px-3 text-right ${diffTotal > 0.05 ? 'text-rose-600' : 'text-slate-600'}`}
                          >
                            R$ {(somaTotalItens - (nota.valor_total || 0)).toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {diffTotal <= 0.05 ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200"
                              >
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-rose-700 bg-rose-50 border-rose-200"
                              >
                                Divergência
                              </Badge>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* Resumo Fiscal por CFOP + CST + Alíquota (Registro SPED Fiscal C190) */}
          <Card className="border-slate-200">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Resumo Fiscal por CFOP e Tributação (SPED Registro C190)
                </CardTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Consolidação dos itens por CFOP de Entrada, CST ICMS e Alíquota aplicável na
                  escrituração.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-4 text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                      <th className="py-2 px-3 font-mono">CFOP</th>
                      <th className="py-2 px-3 font-mono">CST</th>
                      <th className="py-2 px-3 text-right font-mono">Aliq. ICMS</th>
                      <th className="py-2 px-3 text-right font-mono">Vlr. Operação</th>
                      <th className="py-2 px-3 text-right font-mono">BC ICMS</th>
                      <th className="py-2 px-3 text-right font-mono">Vlr. ICMS</th>
                      <th className="py-2 px-3 text-right font-mono">BC ST</th>
                      <th className="py-2 px-3 text-right font-mono">Vlr. ST</th>
                      <th className="py-2 px-3 text-right font-mono">Vlr. IPI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {resumoSpedC190.map((reg, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-blue-700">{reg.cfop}</td>
                        <td className="py-2 px-3 font-bold text-slate-800">{reg.cst}</td>
                        <td className="py-2 px-3 text-right">{reg.aliquota.toFixed(2)}%</td>
                        <td className="py-2 px-3 text-right font-medium">
                          R$ {reg.valorOperacao.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right">R$ {reg.baseIcms.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-medium">
                          R$ {reg.valorIcms.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right">R$ {reg.baseIcmsSt.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right">R$ {reg.valorIcmsSt.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right">R$ {reg.valorIpi.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Cards de Totais, Créditos e Custo da Nota */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Composição do Valor da NF-e
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Valor dos Produtos:</span>
                  <span className="font-mono font-medium">
                    R$ {nota.valor_produtos?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Frete da Nota:</span>
                  <span className="font-mono">R$ {nota.valor_frete?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Seguro:</span>
                  <span className="font-mono">R$ {nota.valor_seguro?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Outras Despesas:</span>
                  <span className="font-mono">R$ {nota.valor_outras_despesas?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) IPI:</span>
                  <span className="font-mono">R$ {nota.valor_ipi?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) ICMS-ST / FCP:</span>
                  <span className="font-mono">
                    R$ {((nota.valor_icms_st || 0) + (nota.valor_fcp_st || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-700">
                  <span>(-) Desconto:</span>
                  <span className="font-mono">R$ {nota.valor_desconto?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 pt-3 font-bold text-sm text-slate-900 border-t border-slate-200">
                  <span>Valor Total da Nota:</span>
                  <span className="font-mono text-blue-700">R$ {nota.valor_total?.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Créditos Tributários Totais
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <p className="text-[11px] text-slate-500 mb-2">
                  Créditos fiscais aproveitados na apuração do regime tributário (CRT da empresa
                  ativa).
                </p>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total Crédito ICMS:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    R$ {itens.reduce((acc, i) => acc + (i.valor_credito_icms || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total Crédito IPI:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    R$ {itens.reduce((acc, i) => acc + (i.valor_credito_ipi || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total Crédito PIS:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    R$ {itens.reduce((acc, i) => acc + (i.valor_credito_pis || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total Crédito COFINS:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    R$ {itens.reduce((acc, i) => acc + (i.valor_credito_cofins || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-2 pt-3 font-bold text-xs text-slate-900 border-t border-slate-200">
                  <span>Total de Créditos Fiscais:</span>
                  <span className="font-mono text-emerald-700">
                    R${' '}
                    {itens
                      .reduce(
                        (acc, i) =>
                          acc +
                          (i.valor_credito_icms || 0) +
                          (i.valor_credito_ipi || 0) +
                          (i.valor_credito_pis || 0) +
                          (i.valor_credito_cofins || 0),
                        0,
                      )
                      .toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-slate-50/50">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Custo Efetivo de Aquisição
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <p className="text-[11px] text-slate-500 mb-2">
                  Valor líquido investido que formará o custo médio unitário no estoque.
                </p>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Total dos Produtos:</span>
                  <span className="font-mono">R$ {nota.valor_produtos?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Despesas e IPI / ST:</span>
                  <span className="font-mono">
                    R${' '}
                    {(
                      (nota.valor_frete || 0) +
                      (nota.valor_seguro || 0) +
                      (nota.valor_outras_despesas || 0) +
                      (nota.valor_ipi || 0) +
                      (nota.valor_icms_st || 0) +
                      (valorFreteParte || 0)
                    ).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700">
                  <span>(-) Créditos Fiscais:</span>
                  <span className="font-mono">
                    R${' '}
                    {itens
                      .reduce(
                        (acc, i) =>
                          acc +
                          (i.valor_credito_icms || 0) +
                          (i.valor_credito_ipi || 0) +
                          (i.valor_credito_pis || 0) +
                          (i.valor_credito_cofins || 0),
                        0,
                      )
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-2 pt-3 font-bold text-sm text-slate-900 border-t border-slate-200">
                  <span>Custo Total da Entrada:</span>
                  <span className="font-mono text-emerald-800">
                    R$ {itens.reduce((acc, i) => acc + (i.custo_total_item || 0), 0).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= ABA PARCELAS ================= */}
        <TabsContent value="parcelas" className="mt-4 space-y-3">
          <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              <strong>Integração Financeira:</strong> Na Etapa 4, o módulo de Contas a Pagar será
              gerado a partir destas parcelas registradas na nota fiscal.
            </span>
          </div>

          <Card className="border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="py-2.5 px-4 w-28">Nº Parcela</th>
                  <th className="py-2.5 px-4 w-40">Data de Vencimento</th>
                  <th className="py-2.5 px-4 w-48 text-right">Valor da Parcela</th>
                  <th className="py-2.5 px-4">Forma de Pagamento (tPag)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parcelas.map((parc) => (
                  <tr key={parc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                      {parc.numero}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{parc.data_vencimento}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      R$ {parc.valor.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {parc.forma_pagamento ? `Código tPag: ${parc.forma_pagamento}` : 'A combinar'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* ================= ABA INFORMAÇÕES ================= */}
        <TabsContent value="informacoes" className="mt-4 space-y-4">
          <Card className="border-slate-200">
            <CardHeader className="py-3 px-4 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-800">
                Informações Complementares e Fisco (infAdic)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-200 font-mono text-[11px] whitespace-pre-wrap text-slate-700 leading-relaxed max-h-80 overflow-y-auto">
                {nota.informacoes_complementares ||
                  'Nenhuma informação complementar declarada no XML.'}
              </div>

              {nota.observacao && (
                <div>
                  <h5 className="font-semibold text-slate-800 mb-1">Observações Internas</h5>
                  <p className="bg-amber-50/50 p-2.5 rounded border border-amber-200 text-amber-900 whitespace-pre-wrap">
                    {nota.observacao}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA XML FORMATADO ================= */}
        <TabsContent value="xml" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Visualização integral do arquivo XML recebido da SEFAZ (somente leitura).
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={copiarXml}
              disabled={!conteudoXmlTexto}
              className="h-8 text-xs gap-1.5"
            >
              {copiadoXml ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copiadoXml ? 'Copiado!' : 'Copiar XML Completo'}
            </Button>
          </div>

          <Card className="border-slate-200 bg-slate-900 text-slate-100 overflow-hidden shadow-xs">
            <div className="p-4 max-h-[500px] overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {conteudoXmlTexto || 'Carregando conteúdo XML do documento...'}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Produtos Não Cadastrados na NF-e */}
      <ModalProdutosNaoCadastrados
        aberto={modalLoteNaoCadastradosAberto}
        onOpenChange={setModalLoteNaoCadastradosAberto}
        notaId={nota.id}
        notaInfo={{
          modelo: String(nota.modelo || '55'),
          serie: String(nota.serie || '1'),
          numero: String(nota.numero || ''),
          fornecedorNome: nota.expand?.fornecedor_id?.razao_social || '',
          dataEmissao: nota.data_emissao,
        }}
        fornecedorId={nota.fornecedor_id}
        empresa={empresaAtiva as any}
        itensSemProduto={itens.filter((i) => !i.produto_id)}
        tipoEntrada={nota.tipo_entrada}
        ufFornecedor={nota.expand?.fornecedor_id?.uf}
        onConcluido={() => carregarDados()}
      />

      {/* Modal Detalhes e Edição Fiscal do Item */}
      {itemFiscalSelecionado && (
        <ModalConferenciaFiscalItem
          aberto={modalFiscalItemAberto}
          onOpenChange={setModalFiscalItemAberto}
          item={itemFiscalSelecionado}
          produto={(itemFiscalSelecionado.expand?.produto_id as any) || null}
          sugestao={mapaSugestoesFiscais[itemFiscalSelecionado.id] || null}
          onSalvarProduto={async (campos) => {
            if (itemFiscalSelecionado.produto_id) {
              await pb.collection('produtos').update(itemFiscalSelecionado.produto_id, campos)
              toast({ title: 'Campos fiscais do produto atualizados com sucesso!' })
              await carregarDados()
            }
          }}
        />
      )}

      {/* Modal Buscar Produto para Vincular */}
      <Dialog open={modalBuscaAberto} onOpenChange={setModalBuscaAberto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Vincular Produto do Catálogo</DialogTitle>
            <DialogDescription>
              Selecione o produto correspondente para o item #
              {itemSelecionadoParaVinculo?.numero_item} (
              <strong>{itemSelecionadoParaVinculo?.descricao_fornecedor}</strong>).
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label className="text-xs font-semibold mb-1 block">Pesquisar Produto (ERP)</Label>
            <SelectProduto
              value=""
              onChange={(prodId) => {
                if (prodId && itemSelecionadoParaVinculo) {
                  handleVincularProdutoManual(itemSelecionadoParaVinculo, prodId)
                }
              }}
              placeholder="Digite código, descrição ou GTIN do produto..."
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalBuscaAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cadastro Rápido de Produto a partir do Item */}
      {modalCriacaoAberto && itemSelecionadoParaVinculo && (
        <ProdutoCadastroRapido
          aberto={modalCriacaoAberto}
          onClose={() => {
            setModalCriacaoAberto(false)
            setItemSelecionadoParaVinculo(null)
          }}
          onSucesso={async (prodCriado) => {
            if (itemSelecionadoParaVinculo) {
              await handleVincularProdutoManual(itemSelecionadoParaVinculo, prodCriado.id)
            }
          }}
          fornecedorId={nota.fornecedor_id}
          dadosIniciais={{
            descricao: itemSelecionadoParaVinculo.descricao_fornecedor,
            codigoNoFornecedor: itemSelecionadoParaVinculo.codigo_fornecedor,
            gtin: itemSelecionadoParaVinculo.gtin_fornecedor,
            ncm: itemSelecionadoParaVinculo.ncm_fornecedor,
            cest: itemSelecionadoParaVinculo.cest_fornecedor,
            unidadeSigla: itemSelecionadoParaVinculo.unidade_fornecedor,
            precoCusto: itemSelecionadoParaVinculo.valor_unitario_fornecedor,
          }}
        />
      )}

      {/* Modal Confirmar Lançamento da Nota */}
      <Dialog open={modalLancarAberto} onOpenChange={setModalLancarAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Lançar Nota de Entrada #{nota.numero}
            </DialogTitle>
            <DialogDescription>
              Ao efetivar o lançamento, os itens movimentarão o estoque e os custos serão
              atualizados. A nota ficará gravada como <strong>Lançada</strong> (somente leitura).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Opção Atualizar custo dos produtos */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="atualizar_custo_produtos"
                  checked={atualizarCustoProdutos}
                  onCheckedChange={(c) => setAtualizarCustoProdutos(Boolean(c))}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="atualizar_custo_produtos"
                    className="text-xs font-semibold text-slate-800 cursor-pointer block"
                  >
                    Atualizar custo dos produtos
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Grava o preço de custo no cadastro dos produtos com base no custo unitário de
                    estoque da nota e recalcula a margem mantendo o preço de venda atual.
                  </p>
                </div>
              </div>
            </div>

            {/* Opção "Já paga" para notas à vista / sem parcelas */}
            {parcelas.length === 0 && (
              <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-200 space-y-3">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="ja_paga"
                    checked={jaPaga}
                    onCheckedChange={(c) => setJaPaga(Boolean(c))}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <label
                      htmlFor="ja_paga"
                      className="text-xs font-semibold text-blue-900 cursor-pointer block"
                    >
                      Nota já paga (baixa imediata no Financeiro)
                    </label>
                    <p className="text-[11px] text-blue-700">
                      Esta nota não possui parcelas a prazo. Ao marcar esta opção, o título gerado
                      no Contas a Pagar será quitado imediatamente na mesma operação, debitando o
                      saldo da conta financeira.
                    </p>
                  </div>
                </div>

                {jaPaga && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-blue-200/60">
                    <div className="space-y-1">
                      <Label
                        htmlFor="conta_pagamento"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        Conta Financeira / Caixa *
                      </Label>
                      <select
                        id="conta_pagamento"
                        value={contaPagamentoId}
                        onChange={(e) => setContaPagamentoId(e.target.value)}
                        className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Selecione a conta...</option>
                        {contasFinanceirasDisponiveis.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label
                        htmlFor="forma_pagamento"
                        className="text-[11px] font-semibold text-slate-700"
                      >
                        Forma de Pagamento
                      </Label>
                      <select
                        id="forma_pagamento"
                        value={formaPagamentoId}
                        onChange={(e) => setFormaPagamentoId(e.target.value)}
                        className="w-full h-8 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Selecione a forma...</option>
                        {formasPagamentoDisponiveis.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.descricao}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aviso de divergência de soma dos itens vs total da nota */}
            {precisaJustificativaDivergencia && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 space-y-2 text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  Divergência entre soma dos itens e total da nota (R${' '}
                  {valorDivergenciaItens.toFixed(2)})
                </div>
                <p className="text-[11px] leading-relaxed">
                  A soma dos itens diverge do total da nota em mais de R$ 0,05. Para prosseguir com
                  o lançamento, justifique o motivo desta diferença:
                </p>
                <div className="space-y-1 pt-1">
                  <Label
                    htmlFor="justificativa_divergencia"
                    className="text-[11px] font-semibold text-amber-900"
                  >
                    Motivo da divergência *
                  </Label>
                  <Textarea
                    id="justificativa_divergencia"
                    placeholder="Ex: Diferença de arredondamento de frete/seguro ou acréscimo comercial..."
                    value={justificativaDivergencia}
                    onChange={(e) => setJustificativaDivergencia(e.target.value)}
                    rows={2}
                    className="text-xs bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalLancarAberto(false)}
              disabled={lancando}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmarLancamento}
              disabled={
                lancando || (precisaJustificativaDivergencia && !justificativaDivergencia.trim())
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {lancando ? 'Lançando...' : 'Confirmar Lançamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Revisão de Preços (pós-lançamento) */}
      <Dialog open={modalRevisaoPrecosAberto} onOpenChange={setModalRevisaoPrecosAberto}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-800">
              <Sparkles className="h-5 w-5 text-amber-600" />
              Revisão de Preços de Venda
            </DialogTitle>
            <DialogDescription>
              Os seguintes produtos tiveram a margem reduzida abaixo da margem padrão após a
              entrada. Ajuste os preços de venda desejados e salve tudo de uma só vez:
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Produto</th>
                    <th className="py-2.5 px-3 text-right">Novo Custo</th>
                    <th className="py-2.5 px-3 text-right">Preço Atual</th>
                    <th className="py-2.5 px-3 text-right">Margem Atual</th>
                    <th className="py-2.5 px-3 text-right">Margem Padrão</th>
                    <th className="py-2.5 px-3 text-right">Preço Sugerido</th>
                    <th className="py-2.5 px-3 text-right w-36">Novo Preço Venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itensRevisao.map((rev) => {
                    const precoDigitado = precosEditados[rev.produto_id] ?? rev.preco_sugerido
                    const margemDigitada =
                      rev.custo_novo > 0
                        ? ((precoDigitado - rev.custo_novo) / rev.custo_novo) * 100
                        : 0

                    return (
                      <tr key={rev.produto_id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">
                            [{rev.codigo}] {rev.descricao}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          R$ {rev.custo_novo.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          R$ {rev.preco_atual.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600 font-semibold">
                          {rev.margem_atual.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {rev.margem_padrao.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-bold">
                          R$ {rev.preco_sugerido.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="space-y-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={precoDigitado || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                setPrecosEditados((prev) => ({
                                  ...prev,
                                  [rev.produto_id]: val,
                                }))
                              }}
                              className="h-7 text-xs font-mono text-right font-semibold"
                            />
                            <div className="text-[10px] text-slate-500 font-mono">
                              Margem: {margemDigitada.toFixed(1)}%
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalRevisaoPrecosAberto(false)}
              disabled={salvandoPrecos}
            >
              Manter Preços Atuais
            </Button>
            <Button
              size="sm"
              onClick={handleSalvarPrecosRevisao}
              disabled={salvandoPrecos}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {salvandoPrecos ? 'Salvando...' : 'Salvar Novos Preços'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cancelar Lançamento / Cancelar Nota */}
      <Dialog open={cancelarModalAberto} onOpenChange={setCancelarModalAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-rose-700">
              {nota.status === 'Lançada'
                ? `Cancelar Lançamento da Nota #${nota.numero}`
                : `Cancelar Nota de Entrada #${nota.numero}`}
            </DialogTitle>
            <DialogDescription>
              {nota.status === 'Lançada'
                ? 'Esta ação estornará todos os movimentos de estoque gerados pela nota e desfarará as quantidades recebidas no pedido de compra vinculado. A nota passará para o status Cancelada.'
                : 'A nota passará para o status Cancelada.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {nota.status === 'Lançada' && (
              <Alert className="py-2 px-3 bg-amber-50 border-amber-300 text-amber-900 text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <AlertDescription className="text-[11px]">
                  <strong>Aviso importante:</strong> O preço de custo dos produtos não será
                  revertido.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1">
              <Label htmlFor="motivo_cancelamento" className="text-xs font-semibold">
                Justificativa do Cancelamento *
              </Label>
              <Textarea
                id="motivo_cancelamento"
                placeholder="Descreva detalhadamente o motivo do cancelamento..."
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelarModalAberto(false)}
              disabled={cancelando}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancelarNota}
              disabled={cancelando || !motivoCancelamento.trim()}
            >
              {cancelando ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default NotaEntradaConferenciaPage
