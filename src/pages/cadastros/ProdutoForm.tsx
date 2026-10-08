import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Package,
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Copy,
  Plus,
  Trash2,
  Clock,
  Truck,
  Repeat,
  Boxes,
  FileText,
  DollarSign,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import pb from '@/lib/pocketbase/client'
import { ProdutoAbaFiscal } from '@/components/ProdutoAbaFiscal'
import { ProdutoAbaEstoque } from '@/components/ProdutoAbaEstoque'

import {
  Produto,
  TipoProduto,
  salvarProduto,
  obterProdutoPorId,
  obterProximoCodigoProduto,
  validarDadosProduto,
  duplicarProduto,
  calcularCustoFinal,
  sugerirPrecoVenda,
  recalcularMargem,
  calcularMargemSobreVenda,
  calcularMarkup,
  ProdutoFornecedor,
  listarFornecedoresDoProduto,
  salvarProdutoFornecedor,
  inativarProdutoFornecedor,
  ProdutoConversaoUnidade,
  listarConversoesDoProduto,
  salvarProdutoConversao,
  inativarProdutoConversao,
  ProdutoKitItem,
  listarItensDoKit,
  salvarItemKit,
  inativarItemKit,
  ProdutoHistorico,
  listarHistoricoDoProduto,
} from '@/services/produtos'

import { SelectMarca } from '@/components/SelectMarca'
import { SelectGrupoCategoria } from '@/components/SelectGrupoCategoria'
import { SelectFornecedor } from '@/components/SelectFornecedor'
import { SelectProduto } from '@/components/SelectProduto'
import { listarTodasUnidadesMedidaAtivas, UnidadeMedida } from '@/services/unidadesMedida'
import { formatarCNPJ, formatarCPF } from '@/lib/validacoes'
import { listarEntradasDoProduto, EntradaHistoricoProduto } from '@/services/consultasCompras'

export const ProdutoForm: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const ehEdicao = Boolean(id)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { pode } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()

  // Determinar regime da empresa ativa
  const crtEmpresaAtiva = empresaAtiva?.crt ?? 1
  const regimeEmpresaAtiva: 'Simples Nacional' | 'Regime Normal' =
    crtEmpresaAtiva === 3 ? 'Regime Normal' : 'Simples Nacional'

  const podeSalvar = ehEdicao ? pode('produtos', 'editar') : pode('produtos', 'criar')

  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('geral')

  // Unidades de medida disponíveis
  const [unidadesMedida, setUnidadesMedida] = useState<UnidadeMedida[]>([])

  // Formulário Principal
  const [formData, setFormData] = useState<Partial<Produto>>({
    ativo: true,
    tipo: 'Produto',
    descricao: '',
    descricao_reduzida: '',
    gtin: '',
    gtin_tributavel: '',
    referencia: '',
    marca_id: undefined,
    grupo_id: undefined,
    categoria_id: undefined,
    fornecedor_principal_id: undefined,
    observacoes: '',

    // Unidades
    unidade_id: undefined,
    unidade_tributavel_id: undefined,
    fator_conversao_tributavel: 1,

    // Preços
    preco_custo: 0,
    outras_despesas_percentual: 0,
    custo_final: 0,
    margem_percentual: 0,
    preco_venda: 0,
    preco_promocional: undefined,
    promocao_inicio: '',
    promocao_fim: '',
    permite_desconto: true,
    desconto_maximo_percentual: 0,

    // Estoque
    controla_estoque: true,
    estoque_minimo: 0,
    estoque_maximo: 0,
    localizacao: '',
    controla_lote_validade: false,
    dias_validade: undefined,
    vende_fracionado: false,
    vende_no_pdv: true,
    peso_liquido_kg: undefined,
    peso_bruto_kg: undefined,
    altura_cm: undefined,
    largura_cm: undefined,
    comprimento_cm: undefined,

    // Fiscais (armazenados sem edição direta nesta etapa)
    ncm: '',
    cest: '',
    origem: '0',
    fiscal_revisado: false,
  })

  // Imagens
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotosAdicionais, setFotosAdicionais] = useState<File[]>([])
  const [fotosAdicionaisExistentes, setFotosAdicionaisExistentes] = useState<string[]>([])

  // Tabelas auxiliares
  const [fornecedoresDoProduto, setFornecedoresDoProduto] = useState<ProdutoFornecedor[]>([])
  const [conversoesDoProduto, setConversoesDoProduto] = useState<ProdutoConversaoUnidade[]>([])
  const [itensDoKit, setItensDoKit] = useState<ProdutoKitItem[]>([])
  const [historicoSPED, setHistoricoSPED] = useState<ProdutoHistorico[]>([])
  const [entradasCompras, setEntradasCompras] = useState<EntradaHistoricoProduto[]>([])
  const [carregandoEntradas, setCarregandoEntradas] = useState<boolean>(false)

  // Modais de CRUD auxiliares
  const [modalFornecedorAberto, setModalFornecedorAberto] = useState(false)
  const [fornItem, setFornItem] = useState<{
    id?: string
    fornecedor_id: string
    codigo_no_fornecedor: string
    descricao_no_fornecedor: string
    unidade_fornecedor: string
    fator_conversao: number
    ultimo_preco_compra?: number
  }>({
    fornecedor_id: '',
    codigo_no_fornecedor: '',
    descricao_no_fornecedor: '',
    unidade_fornecedor: '',
    fator_conversao: 1,
  })

  const [modalConversaoAberto, setModalConversaoAberto] = useState(false)
  const [convItem, setConvItem] = useState<{
    id?: string
    unidade_id: string
    fator_conversao: number
    gtin_unidade: string
  }>({
    unidade_id: '',
    fator_conversao: 1,
    gtin_unidade: '',
  })

  const [modalKitAberto, setModalKitAberto] = useState(false)
  const [kitItem, setKitItem] = useState<{
    id?: string
    produto_item_id: string
    quantidade: number
  }>({
    produto_item_id: '',
    quantidade: 1,
  })

  // Erros de validação
  const [erros, setErros] = useState<Record<string, string>>({})

  // Carregar dados de inicialização
  useEffect(() => {
    listarTodasUnidadesMedidaAtivas()
      .then((unidades) => {
        setUnidadesMedida(unidades)
        if (!ehEdicao && unidades.length > 0 && !formData.unidade_id) {
          // Define a primeira unidade como padrão
          const padrao = unidades.find((u) => u.sigla.toUpperCase() === 'UN') || unidades[0]
          setFormData((prev) => ({
            ...prev,
            unidade_id: padrao.id,
            unidade_tributavel_id: padrao.id,
            vende_fracionado: padrao.aceita_fracionado,
          }))
        }
      })
      .catch(console.error)

    if (!ehEdicao) {
      obterProximoCodigoProduto().then((cod) => {
        setFormData((prev) => ({ ...prev, codigo: cod }))
      })
    }
  }, [ehEdicao])

  // Carregar dados do produto em edição
  const carregarProduto = useCallback(
    async (produtoId: string) => {
      setCarregando(true)
      try {
        const prod = await obterProdutoPorId(produtoId)
        setFormData(prod)

        if (prod.foto) {
          setFotoPreview(pb.files.getURL(prod, prod.foto))
        }
        if (prod.fotos_adicionais && prod.fotos_adicionais.length > 0) {
          setFotosAdicionaisExistentes(prod.fotos_adicionais.map((f) => pb.files.getURL(prod, f)))
        }

        // Carregar auxiliares em paralelo
        const [forns, convs, kits, hist] = await Promise.all([
          listarFornecedoresDoProduto(produtoId),
          listarConversoesDoProduto(produtoId),
          prod.tipo === 'Kit' ? listarItensDoKit(produtoId) : Promise.resolve([]),
          listarHistoricoDoProduto(produtoId),
        ])

        setFornecedoresDoProduto(forns)
        setConversoesDoProduto(convs)
        setItensDoKit(kits)
        setHistoricoSPED(hist)

        // Carregar últimas 20 entradas de compras
        setCarregandoEntradas(true)
        listarEntradasDoProduto(produtoId, empresaAtiva?.id)
          .then((ent) => setEntradasCompras(ent))
          .catch((e) => console.warn('Erro ao carregar entradas de compras:', e))
          .finally(() => setCarregandoEntradas(false))
      } catch (err: unknown) {
        toast({
          title: 'Erro ao carregar produto',
          description: err instanceof Error ? err.message : 'Falha ao buscar dados',
          variant: 'destructive',
        })
        navigate('/cadastros/produtos')
      } finally {
        setCarregando(false)
      }
    },
    [navigate, toast],
  )

  useEffect(() => {
    if (ehEdicao && id) {
      carregarProduto(id)
    }
  }, [ehEdicao, id, carregarProduto])

  // Alteração em lote de campos (usado pela aba fiscal ao aplicar perfil)
  const handleMudarCamposEmLote = (novosCampos: Partial<Produto>) => {
    setFormData((prev) => ({
      ...prev,
      ...novosCampos,
    }))
    // Limpa erros dos campos alterados
    setErros((prev) => {
      const copy = { ...prev }
      Object.keys(novosCampos).forEach((k) => delete copy[k])
      return copy
    })
  }

  // Lógica de alteração de campos
  const handleCampoChange = (campo: keyof Produto, valor: any) => {
    setFormData((prev) => {
      const novo = { ...prev, [campo]: valor }

      // Se mudar o tipo para Serviço, desmarca controla_estoque por padrão
      if (campo === 'tipo') {
        if (valor === 'Serviço') {
          novo.controla_estoque = false
        } else if (prev.tipo === 'Serviço') {
          novo.controla_estoque = true
        }
      }

      // Se mudar a unidade comercial, herdar aceita_fracionado
      if (campo === 'unidade_id') {
        const u = unidadesMedida.find((item) => item.id === valor)
        if (u) {
          novo.vende_fracionado = u.aceita_fracionado
          if (!prev.unidade_tributavel_id) {
            novo.unidade_tributavel_id = u.id
          }
        }
      }

      // Cálculos bidirecionais de preços
      if (campo === 'preco_custo' || campo === 'outras_despesas_percentual') {
        const custo = campo === 'preco_custo' ? Number(valor) : Number(prev.preco_custo || 0)
        const desp =
          campo === 'outras_despesas_percentual'
            ? Number(valor)
            : Number(prev.outras_despesas_percentual || 0)
        const cFinal = calcularCustoFinal(custo, desp)
        novo.custo_final = cFinal

        // Se houver margem definida, sugere o preço de venda
        if (prev.margem_percentual !== undefined && prev.margem_percentual !== null) {
          novo.preco_venda = sugerirPrecoVenda(cFinal, Number(prev.margem_percentual))
        }
      } else if (campo === 'margem_percentual') {
        const margem = Number(valor)
        const cFinal =
          novo.custo_final ||
          calcularCustoFinal(novo.preco_custo || 0, novo.outras_despesas_percentual || 0)
        novo.preco_venda = sugerirPrecoVenda(cFinal, margem)
      } else if (campo === 'preco_venda') {
        const pVenda = Number(valor)
        const cFinal =
          novo.custo_final ||
          calcularCustoFinal(novo.preco_custo || 0, novo.outras_despesas_percentual || 0)
        novo.margem_percentual = recalcularMargem(pVenda, cFinal)
      }

      return novo
    })

    if (erros[campo]) {
      setErros((prev) => {
        const copy = { ...prev }
        delete copy[campo]
        return copy
      })
    }
  }

  // Tratamento da imagem
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'A foto principal deve ter até 2 MB.',
        variant: 'destructive',
      })
      return
    }

    setFotoArquivo(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setFotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleFotosAdicionaisChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length === 0) return

    if (files.length + fotosAdicionais.length + fotosAdicionaisExistentes.length > 5) {
      toast({
        title: 'Limite excedido',
        description: 'Você pode adicionar no máximo 5 fotos adicionais.',
        variant: 'destructive',
      })
      return
    }

    const arquivosValidos = files.filter((f) => f.size <= 2 * 1024 * 1024)
    if (arquivosValidos.length < files.length) {
      toast({
        title: 'Aviso',
        description: 'Algumas fotos ultrapassaram o limite de 2 MB e foram ignoradas.',
      })
    }

    setFotosAdicionais((prev) => [...prev, ...arquivosValidos])
  }

  // Salvar Produto (completo com validações fiscais ou rascunho)
  const executarSalvar = async (ignorarValidacoesFiscais = false) => {
    const validacao = await validarDadosProduto(formData, id, {
      ignorarValidacoesFiscais,
      regimeEmpresa: regimeEmpresaAtiva,
    })

    if (!validacao.valido) {
      setErros(validacao.erros)
      if (validacao.temErroFiscal) {
        setAbaAtiva('fiscal')
      }
      toast({
        title: 'Verifique os campos obrigatórios',
        description: Object.values(validacao.erros)[0],
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const salvo = await salvarProduto({
        ...formData,
        fotoArquivo,
        fotosAdicionaisArquivos: fotosAdicionais,
      })

      toast({
        title: ignorarValidacoesFiscais
          ? 'Salvo como rascunho fiscal'
          : ehEdicao
            ? 'Produto atualizado'
            : 'Produto cadastrado',
        description: ignorarValidacoesFiscais
          ? `O produto "${salvo.descricao}" foi salvo como rascunho com o selo "Fiscal incompleto".`
          : `O produto "${salvo.descricao}" (Código #${salvo.codigo}) foi salvo com sucesso.`,
      })

      if (!ehEdicao) {
        navigate(`/cadastros/produtos/${salvo.id}/editar`)
      } else {
        carregarProduto(salvo.id)
      }
    } catch (err: unknown) {
      toast({
        title: 'Erro ao salvar produto',
        description: err instanceof Error ? err.message : 'Falha ao gravar no banco',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    await executarSalvar(false)
  }

  const handleSalvarComoRascunho = async () => {
    await executarSalvar(true)
  }

  // Duplicar produto
  const handleDuplicar = async () => {
    if (!id) return
    setSalvando(true)
    try {
      const novo = await duplicarProduto(id)
      toast({
        title: 'Produto duplicado',
        description: `Novo produto gerado com código #${novo.codigo}.`,
      })
      navigate(`/cadastros/produtos/${novo.id}/editar`)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao duplicar produto',
        description: err instanceof Error ? err.message : 'Falha na duplicação',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Auxiliares: Fornecedores
  const handleSalvarFornecedorAux = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) {
      toast({ title: 'Salve o produto antes de vincular fornecedores.', variant: 'destructive' })
      return
    }
    if (!fornItem.fornecedor_id) {
      toast({ title: 'Selecione um fornecedor.', variant: 'destructive' })
      return
    }

    try {
      await salvarProdutoFornecedor({
        id: fornItem.id,
        produto_id: id,
        fornecedor_id: fornItem.fornecedor_id,
        codigo_no_fornecedor: fornItem.codigo_no_fornecedor,
        descricao_no_fornecedor: fornItem.descricao_no_fornecedor,
        unidade_fornecedor: fornItem.unidade_fornecedor,
        fator_conversao: fornItem.fator_conversao,
        ultimo_preco_compra: fornItem.ultimo_preco_compra,
      })

      toast({ title: 'Fornecedor vinculado com sucesso.' })
      setModalFornecedorAberto(false)
      listarFornecedoresDoProduto(id).then(setFornecedoresDoProduto)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao vincular fornecedor',
        description: err instanceof Error ? err.message : '',
      })
    }
  }

  const handleRemoverFornecedorAux = async (fornId: string) => {
    if (!id) return
    try {
      await inativarProdutoFornecedor(fornId)
      toast({ title: 'Vínculo com fornecedor removido.' })
      listarFornecedoresDoProduto(id).then(setFornecedoresDoProduto)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao remover vínculo',
        description: err instanceof Error ? err.message : '',
      })
    }
  }

  // Auxiliares: Conversões de Unidade
  const handleSalvarConversaoAux = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) {
      toast({ title: 'Salve o produto antes de cadastrar conversões.', variant: 'destructive' })
      return
    }
    if (!convItem.unidade_id) {
      toast({ title: 'Selecione a unidade.', variant: 'destructive' })
      return
    }

    try {
      await salvarProdutoConversao({
        id: convItem.id,
        produto_id: id,
        unidade_id: convItem.unidade_id,
        fator_conversao: convItem.fator_conversao,
        gtin_unidade: convItem.gtin_unidade,
      })

      toast({ title: 'Conversão de unidade salva com sucesso.' })
      setModalConversaoAberto(false)
      listarConversoesDoProduto(id).then(setConversoesDoProduto)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao salvar conversão',
        description: err instanceof Error ? err.message : '',
      })
    }
  }

  const handleRemoverConversaoAux = async (convId: string) => {
    if (!id) return
    try {
      await inativarProdutoConversao(convId)
      toast({ title: 'Conversão removida.' })
      listarConversoesDoProduto(id).then(setConversoesDoProduto)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao remover conversão',
        description: err instanceof Error ? err.message : '',
      })
    }
  }

  // Auxiliares: Composição de Kit
  const handleSalvarKitAux = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) {
      toast({ title: 'Salve o produto antes de adicionar componentes.', variant: 'destructive' })
      return
    }
    if (!kitItem.produto_item_id) {
      toast({ title: 'Selecione o produto componente.', variant: 'destructive' })
      return
    }

    try {
      await salvarItemKit({
        id: kitItem.id,
        produto_kit_id: id,
        produto_item_id: kitItem.produto_item_id,
        quantidade: kitItem.quantidade,
      })

      toast({ title: 'Item adicionado à composição do kit.' })
      setModalKitAberto(false)
      listarItensDoKit(id).then(setItensDoKit)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao adicionar item ao kit',
        description: err instanceof Error ? err.message : '',
      })
    }
  }

  const handleRemoverKitAux = async (kitItemId: string) => {
    if (!id) return
    try {
      await inativarItemKit(kitItemId)
      toast({ title: 'Item removido da composição.' })
      listarItensDoKit(id).then(setItensDoKit)
    } catch (err: unknown) {
      toast({ title: 'Erro ao remover item', description: err instanceof Error ? err.message : '' })
    }
  }

  // Cálculos de margem e markup em tela
  const custoFinalTela =
    formData.custo_final ||
    calcularCustoFinal(formData.preco_custo || 0, formData.outras_despesas_percentual || 0)
  const precoVendaTela = formData.preco_venda || 0
  const markupCalculado = calcularMarkup(precoVendaTela, custoFinalTela)
  const margemSobreVenda = calcularMargemSobreVenda(precoVendaTela, custoFinalTela)

  if (carregando) {
    return (
      <div className="py-24 text-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
        <p className="text-sm font-medium">Carregando dados do produto...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSalvar} className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/cadastros/produtos')}
            className="h-9 w-9 p-0 text-slate-500 hover:text-slate-800"
            title="Voltar para a listagem"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {ehEdicao ? `Editar Produto #${formData.codigo}` : 'Novo Produto'}
              </h1>
              {ehEdicao && (
                <Badge
                  variant={formData.ativo ? 'default' : 'secondary'}
                  className={`text-[10px] font-normal py-0 px-2 ${
                    formData.ativo
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {formData.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {ehEdicao
                ? formData.descricao || 'Preencha os dados do produto'
                : 'Cadastre um novo item, serviço ou kit no catálogo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ehEdicao && pode('produtos', 'criar') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDuplicar}
              disabled={salvando}
              className="text-xs h-9 border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Duplicar Produto
            </Button>
          )}

          {podeSalvar && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSalvarComoRascunho}
                disabled={salvando}
                title="Salva sem exigir campos fiscais completos (marcado como Fiscal Incompleto)"
                className="text-xs h-9 border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
              >
                Salvar como rascunho fiscal
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={salvando}
                className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-2xs"
              >
                {salvando ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-4 w-4" />
                    Salvar Produto
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Navegação por Abas */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="geral" className="text-xs">
            Dados Gerais
          </TabsTrigger>
          <TabsTrigger value="precos" className="text-xs">
            Preços
          </TabsTrigger>
          <TabsTrigger value="estoque" className="text-xs">
            Estoque
          </TabsTrigger>
          <TabsTrigger value="fornecedores" className="text-xs">
            Fornecedores {fornecedoresDoProduto.length > 0 && `(${fornecedoresDoProduto.length})`}
          </TabsTrigger>
          <TabsTrigger value="conversoes" className="text-xs">
            Conversões {conversoesDoProduto.length > 0 && `(${conversoesDoProduto.length})`}
          </TabsTrigger>
          {formData.tipo === 'Kit' && (
            <TabsTrigger value="composicao" className="text-xs">
              Composição ({itensDoKit.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="fiscal" className="text-xs">
            Fiscal
          </TabsTrigger>
          {ehEdicao && (
            <TabsTrigger value="compras" className="text-xs">
              Compras {entradasCompras.length > 0 && `(${entradasCompras.length})`}
            </TabsTrigger>
          )}
          <TabsTrigger value="historico" className="text-xs">
            Histórico {historicoSPED.length > 0 && `(${historicoSPED.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ======================================================== */}
        {/* ABA 1: DADOS GERAIS */}
        {/* ======================================================== */}
        <TabsContent value="geral" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {/* Código */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Código Interno (COD_ITEM)
                  </Label>
                  <Input
                    type="number"
                    value={formData.codigo || ''}
                    disabled
                    className="h-9 bg-slate-50 font-mono font-bold text-slate-700"
                  />
                  <span className="text-[10px] text-slate-400">Sequencial automático</span>
                </div>

                {/* Tipo */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tipo de Item <span className="text-rose-600">*</span>
                  </Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(val: any) => handleCampoChange('tipo', val)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Produto">Produto</SelectItem>
                      <SelectItem value="Serviço">Serviço</SelectItem>
                      <SelectItem value="Kit">Kit</SelectItem>
                    </SelectContent>
                  </Select>
                  {erros.tipo && <span className="text-[11px] text-rose-600">{erros.tipo}</span>}
                </div>

                {/* Referência */}
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Referência (Código do Fabricante)
                  </Label>
                  <Input
                    type="text"
                    value={formData.referencia || ''}
                    onChange={(e) => handleCampoChange('referencia', e.target.value)}
                    placeholder="Ex: REF-9842"
                    className="h-9 text-xs"
                    maxLength={60}
                  />
                </div>
              </div>

              {/* Descrições */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Descrição Completa (sai na Nota Fiscal) <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.descricao || ''}
                    onChange={(e) => handleCampoChange('descricao', e.target.value)}
                    placeholder="Descrição oficial do produto para NF-e/NFC-e"
                    className="h-9 text-xs"
                    maxLength={120}
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>Máximo 120 caracteres</span>
                    <span>{formData.descricao?.length || 0}/120</span>
                  </div>
                  {erros.descricao && (
                    <span className="text-[11px] text-rose-600">{erros.descricao}</span>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Descrição Reduzida (Cupom e PDV)
                  </Label>
                  <Input
                    type="text"
                    value={formData.descricao_reduzida || ''}
                    onChange={(e) => handleCampoChange('descricao_reduzida', e.target.value)}
                    placeholder="Para impressoras térmicas"
                    className="h-9 text-xs"
                    maxLength={40}
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>Máximo 40 caracteres</span>
                    <span>{formData.descricao_reduzida?.length || 0}/40</span>
                  </div>
                </div>
              </div>

              {/* GTINs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    GTIN / EAN (Código de Barras)
                  </Label>
                  <Input
                    type="text"
                    value={formData.gtin || ''}
                    onChange={(e) => handleCampoChange('gtin', e.target.value.toUpperCase())}
                    placeholder="8, 12, 13 ou 14 dígitos ou SEM GTIN"
                    className="h-9 text-xs font-mono uppercase"
                    maxLength={14}
                  />
                  <span className="text-[10px] text-slate-400">
                    Validação do dígito verificador GS1. Aceita "SEM GTIN".
                  </span>
                  {erros.gtin && (
                    <span className="text-[11px] text-rose-600 block">{erros.gtin}</span>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    GTIN Tributável (se diferente)
                  </Label>
                  <Input
                    type="text"
                    value={formData.gtin_tributavel || ''}
                    onChange={(e) =>
                      handleCampoChange('gtin_tributavel', e.target.value.toUpperCase())
                    }
                    placeholder="Embalagem tributável"
                    className="h-9 text-xs font-mono uppercase"
                    maxLength={14}
                  />
                  {erros.gtin_tributavel && (
                    <span className="text-[11px] text-rose-600 block">{erros.gtin_tributavel}</span>
                  )}
                </div>
              </div>

              {/* Unidades */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Unidade Comercial (uCom) <span className="text-rose-600">*</span>
                  </Label>
                  <Select
                    value={formData.unidade_id}
                    onValueChange={(val) => handleCampoChange('unidade_id', val)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione a unidade..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesMedida.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.sigla} — {u.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {erros.unidade_id && (
                    <span className="text-[11px] text-rose-600">{erros.unidade_id}</span>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Unidade Tributável (uTrib)
                  </Label>
                  <Select
                    value={formData.unidade_tributavel_id || formData.unidade_id}
                    onValueChange={(val) => handleCampoChange('unidade_tributavel_id', val)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Padrão = uCom" />
                    </SelectTrigger>
                    <SelectContent>
                      {unidadesMedida.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.sigla} — {u.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Fator de Conversão Tributável
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.fator_conversao_tributavel ?? 1}
                    onChange={(e) =>
                      handleCampoChange('fator_conversao_tributavel', e.target.value)
                    }
                    placeholder="Padrão: 1"
                    className="h-9 text-xs"
                  />
                  <span className="text-[10px] text-slate-400">
                    Quantas uTrib há em 1 uCom (padrão 1)
                  </span>
                </div>
              </div>

              {/* Classificação: Marca, Grupo, Categoria e Fornecedor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">Marca</Label>
                  <SelectMarca
                    value={formData.marca_id}
                    onChange={(val) => handleCampoChange('marca_id', val)}
                    placeholder="Selecione ou busque a marca..."
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Fornecedor Principal
                  </Label>
                  <SelectFornecedor
                    value={formData.fornecedor_principal_id}
                    onChange={(val) => handleCampoChange('fornecedor_principal_id', val)}
                    placeholder="Selecione o fornecedor padrão..."
                  />
                </div>
              </div>

              <div>
                <SelectGrupoCategoria
                  grupoId={formData.grupo_id || ''}
                  categoriaId={formData.categoria_id || ''}
                  onGrupoChange={(gid, grupo) => {
                    handleCampoChange('grupo_id', gid || undefined)
                    if (
                      grupo?.margem_padrao_percentual &&
                      (!formData.margem_percentual || formData.margem_percentual === 0)
                    ) {
                      handleCampoChange('margem_percentual', grupo.margem_padrao_percentual)
                    }
                  }}
                  onCategoriaChange={(cid, categoria) => {
                    handleCampoChange('categoria_id', cid || undefined)
                    if (
                      categoria?.margem_padrao_percentual &&
                      (!formData.margem_percentual || formData.margem_percentual === 0)
                    ) {
                      handleCampoChange('margem_percentual', categoria.margem_padrao_percentual)
                    }
                  }}
                />
              </div>

              {/* Upload de Imagens */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <Label className="text-xs font-semibold text-slate-700 block">
                  Fotos do Produto (Foto principal até 2 MB + até 5 adicionais)
                </Label>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Foto principal */}
                  <div className="flex items-center gap-3">
                    <div className="h-20 w-20 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                      {fotoPreview ? (
                        <img
                          src={fotoPreview}
                          alt="Foto Principal"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-slate-300" />
                      )}
                    </div>

                    <div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleFotoChange}
                        className="hidden"
                        id="foto-principal-input"
                      />
                      <label htmlFor="foto-principal-input">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs cursor-pointer"
                          asChild
                        >
                          <span>
                            {fotoPreview ? 'Trocar Foto Principal' : 'Adicionar Foto Principal'}
                          </span>
                        </Button>
                      </label>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Formatos: JPG, PNG, WEBP (até 2 MB)
                      </p>
                    </div>
                  </div>

                  {/* Fotos adicionais */}
                  <div className="border-l border-slate-200 pl-4 space-y-2">
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleFotosAdicionaisChange}
                      className="hidden"
                      id="fotos-adicionais-input"
                    />
                    <label htmlFor="fotos-adicionais-input">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs cursor-pointer"
                        asChild
                      >
                        <span>Adicionar Fotos Complementares</span>
                      </Button>
                    </label>
                    <span className="text-[10px] text-slate-400 block">
                      {fotosAdicionais.length + fotosAdicionaisExistentes.length} de 5 selecionadas
                    </span>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="pt-2 border-t border-slate-100">
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Observações Internas
                </Label>
                <Textarea
                  value={formData.observacoes || ''}
                  onChange={(e) => handleCampoChange('observacoes', e.target.value)}
                  placeholder="Anotações comerciais, detalhes técnicos ou observações internas..."
                  rows={2}
                  className="text-xs"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 2: PREÇOS */}
        {/* ======================================================== */}
        <TabsContent value="precos" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Preço de Custo */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Preço de Custo (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.preco_custo ?? ''}
                    onChange={(e) => handleCampoChange('preco_custo', e.target.value)}
                    placeholder="0,0000"
                    className="h-9 text-xs"
                  />
                  <span className="text-[10px] text-slate-400">Até 4 casas decimais</span>
                </div>

                {/* Outras despesas */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Outras Despesas (%)
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.outras_despesas_percentual ?? ''}
                      onChange={(e) =>
                        handleCampoChange('outras_despesas_percentual', e.target.value)
                      }
                      placeholder="0,00"
                      className="h-9 text-xs pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">
                      %
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Frete, seguro e encargos</span>
                </div>

                {/* Custo Final */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Custo Final Calculado
                  </Label>
                  <Input
                    type="text"
                    value={`R$ ${custoFinalTela.toFixed(4).replace('.', ',')}`}
                    disabled
                    className="h-9 text-xs bg-slate-50 font-bold text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400">Custo + Custo × Despesas %</span>
                </div>
              </div>

              {/* Regra bidirecional: Margem e Preço de Venda */}
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-4">
                <div className="flex items-center gap-2 text-blue-900 font-semibold text-xs">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  <span>Formação de Preço de Venda & Margem (Cálculo Bidirecional)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Margem % */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Margem Desejada (%)
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.margem_percentual ?? ''}
                        onChange={(e) => handleCampoChange('margem_percentual', e.target.value)}
                        placeholder="Ex: 50,00"
                        className="h-9 text-xs pr-8 bg-white"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">
                        %
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Alterar a margem recalcula o preço de venda automaticamente.
                    </span>
                  </div>

                  {/* Preço de Venda */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Preço de Venda (R$) <span className="text-rose-600">*</span>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.preco_venda ?? ''}
                      onChange={(e) => handleCampoChange('preco_venda', e.target.value)}
                      placeholder="0,00"
                      className="h-9 text-xs font-bold text-emerald-700 bg-white"
                    />
                    <span className="text-[10px] text-slate-500">
                      Alterar o preço de venda recalcula a margem instantaneamente.
                    </span>
                    {erros.preco_venda && (
                      <span className="text-[11px] text-rose-600 block">{erros.preco_venda}</span>
                    )}
                  </div>
                </div>

                {/* Métricas comerciais adicionais */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-blue-200 text-slate-700">
                  <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                      Markup
                    </span>
                    <strong className="text-sm text-slate-800">
                      {markupCalculado.toFixed(2).replace('.', ',')}%
                    </strong>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                      Margem s/ Venda
                    </span>
                    <strong className="text-sm text-slate-800">
                      {margemSobreVenda.toFixed(2).replace('.', ',')}%
                    </strong>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                      Lucro Bruto Unitário
                    </span>
                    <strong className="text-sm text-emerald-700">
                      R${' '}
                      {Math.max(0, precoVendaTela - custoFinalTela)
                        .toFixed(2)
                        .replace('.', ',')}
                    </strong>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                      Status de Lucro
                    </span>
                    <strong
                      className={`text-sm ${
                        precoVendaTela >= custoFinalTela ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {precoVendaTela >= custoFinalTela ? 'Positivo' : 'Prejuízo!'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Promoção e Descontos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Preço Promocional (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.preco_promocional ?? ''}
                    onChange={(e) => handleCampoChange('preco_promocional', e.target.value)}
                    placeholder="Opcional"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Início da Promoção
                  </Label>
                  <Input
                    type="date"
                    value={formData.promocao_inicio || ''}
                    onChange={(e) => handleCampoChange('promocao_inicio', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Fim da Promoção
                  </Label>
                  <Input
                    type="date"
                    value={formData.promocao_fim || ''}
                    onChange={(e) => handleCampoChange('promocao_fim', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Permissão de Desconto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 items-center">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.permite_desconto ?? true}
                    onCheckedChange={(checked) => handleCampoChange('permite_desconto', checked)}
                    id="permite-desconto"
                  />
                  <Label
                    htmlFor="permite-desconto"
                    className="cursor-pointer text-xs font-semibold text-slate-700"
                  >
                    Permite desconto na venda / PDV
                  </Label>
                </div>

                {formData.permite_desconto && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Desconto Máximo Permitido (%)
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.desconto_maximo_percentual ?? ''}
                        onChange={(e) =>
                          handleCampoChange('desconto_maximo_percentual', e.target.value)
                        }
                        placeholder="0,00"
                        className="h-9 text-xs pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">
                        %
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 3: ESTOQUE */}
        {/* ======================================================== */}
        <TabsContent value="estoque" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-5 text-xs">
              {/* Controles Principais */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
                  <Switch
                    checked={formData.controla_estoque ?? true}
                    onCheckedChange={(checked) => handleCampoChange('controla_estoque', checked)}
                    id="controla-estoque"
                  />
                  <Label
                    htmlFor="controla-estoque"
                    className="cursor-pointer text-xs font-semibold text-slate-800"
                  >
                    Controla Estoque
                  </Label>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
                  <Switch
                    checked={formData.vende_no_pdv ?? true}
                    onCheckedChange={(checked) => handleCampoChange('vende_no_pdv', checked)}
                    id="vende-pdv"
                  />
                  <Label
                    htmlFor="vende-pdv"
                    className="cursor-pointer text-xs font-semibold text-slate-800"
                  >
                    Disponível no PDV
                  </Label>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
                  <Switch
                    checked={formData.vende_fracionado ?? false}
                    onCheckedChange={(checked) => handleCampoChange('vende_fracionado', checked)}
                    id="vende-fracionado"
                  />
                  <Label
                    htmlFor="vende-fracionado"
                    className="cursor-pointer text-xs font-semibold text-slate-800"
                  >
                    Vende Fracionado (Decimais)
                  </Label>
                </div>
              </div>

              {/* Limites e Localização */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Estoque Mínimo
                  </Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={formData.estoque_minimo ?? ''}
                    onChange={(e) => handleCampoChange('estoque_minimo', e.target.value)}
                    placeholder="0"
                    className="h-9 text-xs"
                  />
                  <span className="text-[10px] text-slate-400">Ponto de reposição</span>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Estoque Máximo
                  </Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={formData.estoque_maximo ?? ''}
                    onChange={(e) => handleCampoChange('estoque_maximo', e.target.value)}
                    placeholder="0"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Localização Física no Almoxarifado
                  </Label>
                  <Input
                    type="text"
                    value={formData.localizacao || ''}
                    onChange={(e) => handleCampoChange('localizacao', e.target.value)}
                    placeholder="Ex: Corredor B - Prateleira 3"
                    className="h-9 text-xs"
                    maxLength={60}
                  />
                </div>
              </div>

              {/* Lote e Validade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 items-center">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.controla_lote_validade ?? false}
                    onCheckedChange={(checked) =>
                      handleCampoChange('controla_lote_validade', checked)
                    }
                    id="lote-validade"
                  />
                  <Label
                    htmlFor="lote-validade"
                    className="cursor-pointer text-xs font-semibold text-slate-800"
                  >
                    Controla Número de Lote e Data de Validade
                  </Label>
                </div>

                {formData.controla_lote_validade && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Dias Padrão de Validade
                    </Label>
                    <Input
                      type="number"
                      value={formData.dias_validade ?? ''}
                      onChange={(e) => handleCampoChange('dias_validade', e.target.value)}
                      placeholder="Ex: 180"
                      className="h-9 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Pesos e Dimensões */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <Label className="text-xs font-semibold text-slate-700 block">
                  Pesos e Dimensões para Frete e Logística
                </Label>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <Label className="text-[11px] text-slate-500 block mb-1">
                      Peso Líquido (kg)
                    </Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={formData.peso_liquido_kg ?? ''}
                      onChange={(e) => handleCampoChange('peso_liquido_kg', e.target.value)}
                      placeholder="0,000"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-500 block mb-1">Peso Bruto (kg)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={formData.peso_bruto_kg ?? ''}
                      onChange={(e) => handleCampoChange('peso_bruto_kg', e.target.value)}
                      placeholder="0,000"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-500 block mb-1">Altura (cm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.altura_cm ?? ''}
                      onChange={(e) => handleCampoChange('altura_cm', e.target.value)}
                      placeholder="0,0"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-500 block mb-1">Largura (cm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.largura_cm ?? ''}
                      onChange={(e) => handleCampoChange('largura_cm', e.target.value)}
                      placeholder="0,0"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] text-slate-500 block mb-1">
                      Comprimento (cm)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.comprimento_cm ?? ''}
                      onChange={(e) => handleCampoChange('comprimento_cm', e.target.value)}
                      placeholder="0,0"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seção Físico-Financeira: Saldo em Todas as Filiais e Últimos 10 Movimentos da Filial Ativa */}
          <ProdutoAbaEstoque
            produtoId={ehEdicao ? id : undefined}
            unidadeSigla={unidadesMedida.find((u) => u.id === formData.unidade_id)?.sigla || 'UN'}
            controlaEstoque={formData.controla_estoque}
            controlaLote={formData.controla_lote_validade}
          />
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA 4: FORNECEDORES */}
        {/* ======================================================== */}
        <TabsContent value="fornecedores" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">
                    Fornecedores do Produto (De-Para de XML de Compra)
                  </h3>
                  <p className="text-slate-500 text-[11px]">
                    Vincula códigos e unidades do fornecedor para conversão automática ao importar
                    XML.
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!ehEdicao) {
                      toast({
                        title: 'Salve o produto antes de vincular fornecedores.',
                        variant: 'destructive',
                      })
                      return
                    }
                    setFornItem({
                      fornecedor_id: '',
                      codigo_no_fornecedor: '',
                      descricao_no_fornecedor: '',
                      unidade_fornecedor: '',
                      fator_conversao: 1,
                    })
                    setModalFornecedorAberto(true)
                  }}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Vincular Fornecedor
                </Button>
              </div>

              {fornecedoresDoProduto.length === 0 ? (
                <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  <Truck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-medium text-slate-600">Nenhum fornecedor vinculado</p>
                  <p className="text-[11px]">Clique em "Vincular Fornecedor" para cadastrar.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Fornecedor</th>
                        <th className="p-2.5">Cód. no Fornecedor</th>
                        <th className="p-2.5">Descrição no Fornecedor</th>
                        <th className="p-2.5 text-center">Unid. Forn.</th>
                        <th className="p-2.5 text-center">Fator Conv.</th>
                        <th className="p-2.5 text-right">Último Preço</th>
                        <th className="p-2.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fornecedoresDoProduto.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-900">
                            {f.expand?.fornecedor_id?.razao_social || 'Fornecedor'}
                          </td>
                          <td className="p-2.5 font-mono">{f.codigo_no_fornecedor || '—'}</td>
                          <td className="p-2.5 text-slate-600">
                            {f.descricao_no_fornecedor || '—'}
                          </td>
                          <td className="p-2.5 text-center font-semibold">
                            {f.unidade_fornecedor || '—'}
                          </td>
                          <td className="p-2.5 text-center font-bold text-blue-700">
                            {f.fator_conversao || 1}
                          </td>
                          <td className="p-2.5 text-right">
                            {f.ultimo_preco_compra ? `R$ ${f.ultimo_preco_compra.toFixed(2)}` : '—'}
                          </td>
                          <td className="p-2.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoverFornecedorAux(f.id)}
                              className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50"
                              title="Remover vínculo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

        {/* ======================================================== */}
        {/* ABA 5: CONVERSÕES DE UNIDADE (SPED 0220) */}
        {/* ======================================================== */}
        <TabsContent value="conversoes" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">
                    Conversões de Unidade de Medida (Registro 0220 do SPED)
                  </h3>
                  <p className="text-slate-500 text-[11px]">
                    Cadastre outras unidades com seus respectivos fatores em relação à unidade de
                    estoque.
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!ehEdicao) {
                      toast({
                        title: 'Salve o produto antes de cadastrar conversões.',
                        variant: 'destructive',
                      })
                      return
                    }
                    setConvItem({
                      unidade_id: '',
                      fator_conversao: 1,
                      gtin_unidade: '',
                    })
                    setModalConversaoAberto(true)
                  }}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Nova Conversão
                </Button>
              </div>

              {conversoesDoProduto.length === 0 ? (
                <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  <Repeat className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-medium text-slate-600">Nenhuma conversão cadastrada</p>
                  <p className="text-[11px]">Exemplo: Caixa com 12 unidades (Fator: 12).</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Unidade Convertida</th>
                        <th className="p-2.5 text-center">Fator de Conversão</th>
                        <th className="p-2.5">GTIN da Unidade</th>
                        <th className="p-2.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {conversoesDoProduto.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-900">
                            {c.expand?.unidade_id?.sigla} — {c.expand?.unidade_id?.descricao}
                          </td>
                          <td className="p-2.5 text-center font-bold text-blue-700">
                            {c.fator_conversao}
                          </td>
                          <td className="p-2.5 font-mono">{c.gtin_unidade || '—'}</td>
                          <td className="p-2.5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoverConversaoAux(c.id)}
                              className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

        {/* ======================================================== */}
        {/* ABA 6: COMPOSIÇÃO DE KIT (só quando tipo = Kit) */}
        {/* ======================================================== */}
        {formData.tipo === 'Kit' && (
          <TabsContent value="composicao" className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Composição do Kit (Itens que compõem este kit)
                    </h3>
                    <p className="text-slate-500 text-[11px]">
                      O kit não possui saldo de estoque individual: a cada venda do kit, o sistema
                      baixa automaticamente os estoques dos itens componentes.
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (!ehEdicao) {
                        toast({
                          title: 'Salve o produto antes de compor o kit.',
                          variant: 'destructive',
                        })
                        return
                      }
                      setKitItem({
                        produto_item_id: '',
                        quantidade: 1,
                      })
                      setModalKitAberto(true)
                    }}
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar Item Componente
                  </Button>
                </div>

                {itensDoKit.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    <Boxes className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-600">
                      Nenhum componente adicionado ao kit
                    </p>
                    <p className="text-[11px]">
                      Adicione os produtos e quantidades que formam este pacote.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Código</th>
                          <th className="p-2.5">Produto Componente</th>
                          <th className="p-2.5 text-center">Quantidade no Kit</th>
                          <th className="p-2.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {itensDoKit.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-slate-700">
                              #{item.expand?.produto_item_id?.codigo || '—'}
                            </td>
                            <td className="p-2.5 font-medium text-slate-900">
                              {item.expand?.produto_item_id?.descricao || 'Produto'}
                            </td>
                            <td className="p-2.5 text-center font-bold text-blue-700">
                              {item.quantidade}
                            </td>
                            <td className="p-2.5 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoverKitAux(item.id)}
                                className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
        )}

        {/* ======================================================== */}
        {/* ABA 7: FISCAL */}
        {/* ======================================================== */}
        <TabsContent value="fiscal" className="space-y-4">
          <ProdutoAbaFiscal
            formData={formData}
            onChangeCampo={handleCampoChange}
            onMudarCamposEmLote={handleMudarCamposEmLote}
            regimeEmpresaAtiva={regimeEmpresaAtiva}
            crtEmpresaAtiva={crtEmpresaAtiva}
            tipoItemProduto={formData.tipo || 'Produto'}
            grupoId={formData.grupo_id}
            erros={erros}
            empresaAtiva={empresaAtiva}
            ehNovo={!ehEdicao}
          />
        </TabsContent>

        {/* ======================================================== */}
        {/* ABA: COMPRAS (ÚLTIMAS ENTRADAS) */}
        {/* ======================================================== */}
        {ehEdicao && (
          <TabsContent value="compras" className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-600" />
                      Últimas 20 Entradas do Produto
                    </h3>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Histórico de aquisição em notas fiscais de entrada lançadas no ERP.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (id) {
                        setCarregandoEntradas(true)
                        listarEntradasDoProduto(id, empresaAtiva?.id)
                          .then(setEntradasCompras)
                          .finally(() => setCarregandoEntradas(false))
                      }
                    }}
                    className="h-7 text-xs text-blue-600"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1 ${carregandoEntradas ? 'animate-spin' : ''}`}
                    />
                    Atualizar
                  </Button>
                </div>

                {carregandoEntradas ? (
                  <div className="py-8 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    <p>Buscando histórico de compras...</p>
                  </div>
                ) : entradasCompras.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-600">
                      Nenhuma entrada por nota fiscal lançada
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      As entradas aparecerão aqui automaticamente quando uma nota de compra deste
                      produto for lançada.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px] font-semibold">
                        <tr>
                          <th className="p-2.5">Data Entrada</th>
                          <th className="p-2.5">Fornecedor</th>
                          <th className="p-2.5">Nota Fiscal</th>
                          <th className="p-2.5 text-right">Qtd Estoque</th>
                          <th className="p-2.5 text-right">Custo Unitário</th>
                          <th className="p-2.5 text-right">Valor Total</th>
                          <th className="p-2.5 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {entradasCompras.map((ent) => (
                          <tr key={ent.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">
                              {ent.data_entrada
                                ? new Date(ent.data_entrada).toLocaleDateString('pt-BR')
                                : '—'}
                            </td>
                            <td
                              className="p-2.5 font-medium text-slate-900 max-w-[200px] truncate"
                              title={ent.fornecedor_nome}
                            >
                              {ent.fornecedor_nome}
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span className="font-mono font-semibold text-slate-800">
                                Nº {ent.numero_nota}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono ml-1">
                                (Mod {ent.modelo || '55'}
                                {ent.serie ? `/${ent.serie}` : ''})
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                              {ent.quantidade_estoque.toLocaleString('pt-BR', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 4,
                              })}{' '}
                              <span className="text-[10px] text-slate-400 font-normal">
                                {ent.unidade_sigla || ''}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                              R${' '}
                              {ent.custo_unitario.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              })}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                              R${' '}
                              {ent.valor_total.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] text-blue-600 hover:text-blue-800 p-1"
                              >
                                <Link to={`/compras/notas-entrada/${ent.nota_id}/conferencia`}>
                                  Ver Nota
                                </Link>
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
        )}

        {/* ======================================================== */}
        {/* ABA 8: HISTÓRICO SPED (Registro 0205) */}
        {/* ======================================================== */}
        <TabsContent value="historico" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4 text-xs">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  Histórico de Alterações de Descrição (SPED 0205)
                </h3>
                <p className="text-slate-500 text-[11px]">
                  Toda alteração na descrição ou no código do produto é salva automaticamente para
                  atender às exigências fiscais do registro 0205 do SPED Fiscal.
                </p>
              </div>

              {historicoSPED.length === 0 ? (
                <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-medium text-slate-600">
                    Nenhuma alteração de descrição registrada
                  </p>
                  <p className="text-[11px]">
                    O histórico começará quando você alterar a descrição do produto.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Data da Alteração</th>
                        <th className="p-2.5">Descrição Anterior</th>
                        <th className="p-2.5">Cód. Anterior</th>
                        <th className="p-2.5">Usuário Responsável</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historicoSPED.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="p-2.5 text-slate-700">
                            {new Date(h.data_alteracao).toLocaleString('pt-BR')}
                          </td>
                          <td className="p-2.5 font-medium text-slate-900">
                            {h.descricao_anterior}
                          </td>
                          <td className="p-2.5 font-mono">{h.codigo_anterior || '—'}</td>
                          <td className="p-2.5 text-slate-600">
                            {h.expand?.usuario_id?.name || h.expand?.usuario_id?.email || 'Sistema'}
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

      {/* ======================================================== */}
      {/* MODAL VINCULAR FORNECEDOR */}
      {/* ======================================================== */}
      <Dialog open={modalFornecedorAberto} onOpenChange={setModalFornecedorAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarFornecedorAux}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Vincular Fornecedor ao Produto
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Fornecedor <span className="text-rose-600">*</span>
                </Label>
                <SelectFornecedor
                  value={fornItem.fornecedor_id}
                  onChange={(val) => setFornItem((prev) => ({ ...prev, fornecedor_id: val }))}
                  placeholder="Selecione o fornecedor..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Código no Fornecedor (cProd)
                  </Label>
                  <Input
                    type="text"
                    value={fornItem.codigo_no_fornecedor}
                    onChange={(e) =>
                      setFornItem((prev) => ({ ...prev, codigo_no_fornecedor: e.target.value }))
                    }
                    placeholder="Ex: PROD-123"
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Unidade no Fornecedor
                  </Label>
                  <Input
                    type="text"
                    value={fornItem.unidade_fornecedor}
                    onChange={(e) =>
                      setFornItem((prev) => ({ ...prev, unidade_fornecedor: e.target.value }))
                    }
                    placeholder="Ex: CX, FD, UN"
                    className="h-8 text-xs uppercase"
                    maxLength={10}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Descrição no Fornecedor (xProd)
                </Label>
                <Input
                  type="text"
                  value={fornItem.descricao_no_fornecedor}
                  onChange={(e) =>
                    setFornItem((prev) => ({ ...prev, descricao_no_fornecedor: e.target.value }))
                  }
                  placeholder="Descrição que consta na nota do fornecedor"
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Fator de Conversão
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={fornItem.fator_conversao}
                    onChange={(e) =>
                      setFornItem((prev) => ({ ...prev, fator_conversao: Number(e.target.value) }))
                    }
                    placeholder="1"
                    className="h-8 text-xs"
                  />
                  <span className="text-[10px] text-slate-400">
                    Quantas unidades nossas vêm em 1 do fornecedor
                  </span>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Último Preço de Compra (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fornItem.ultimo_preco_compra ?? ''}
                    onChange={(e) =>
                      setFornItem((prev) => ({
                        ...prev,
                        ultimo_preco_compra: Number(e.target.value),
                      }))
                    }
                    placeholder="0,00"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalFornecedorAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                Vincular
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL CONVERSÃO DE UNIDADE */}
      {/* ======================================================== */}
      <Dialog open={modalConversaoAberto} onOpenChange={setModalConversaoAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarConversaoAux}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Nova Conversão de Unidade (0220)
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Unidade <span className="text-rose-600">*</span>
                </Label>
                <Select
                  value={convItem.unidade_id}
                  onValueChange={(val) => setConvItem((prev) => ({ ...prev, unidade_id: val }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione a unidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadesMedida.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.sigla} — {u.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Fator de Conversão <span className="text-rose-600">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={convItem.fator_conversao}
                  onChange={(e) =>
                    setConvItem((prev) => ({ ...prev, fator_conversao: Number(e.target.value) }))
                  }
                  placeholder="Ex: 12 (para caixa com 12)"
                  className="h-8 text-xs"
                />
                <span className="text-[10px] text-slate-400">
                  Quantas unidades de estoque equivalem a 1 desta unidade convertida.
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  GTIN desta Unidade (opcional)
                </Label>
                <Input
                  type="text"
                  value={convItem.gtin_unidade}
                  onChange={(e) =>
                    setConvItem((prev) => ({ ...prev, gtin_unidade: e.target.value.toUpperCase() }))
                  }
                  placeholder="Código de barras da embalagem"
                  className="h-8 text-xs font-mono uppercase"
                  maxLength={14}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalConversaoAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                Salvar Conversão
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL COMPOSIÇÃO DE KIT */}
      {/* ======================================================== */}
      <Dialog open={modalKitAberto} onOpenChange={setModalKitAberto}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSalvarKitAux}>
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900">
                Adicionar Componente ao Kit
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Produto Componente <span className="text-rose-600">*</span>
                </Label>
                <SelectProduto
                  value={kitItem.produto_item_id}
                  onChange={(val) => setKitItem((prev) => ({ ...prev, produto_item_id: val }))}
                  filtroTipo="Produto"
                  placeholder="Selecione o produto componente..."
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Quantidade neste Kit <span className="text-rose-600">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  value={kitItem.quantidade}
                  onChange={(e) =>
                    setKitItem((prev) => ({ ...prev, quantidade: Number(e.target.value) }))
                  }
                  placeholder="1"
                  className="h-8 text-xs"
                />
                <span className="text-[10px] text-slate-400">
                  Quantidade baixada do estoque para cada unidade de kit vendida.
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalKitAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                Adicionar ao Kit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </form>
  )
}

export default ProdutoForm
