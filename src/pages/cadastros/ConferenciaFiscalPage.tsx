import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Filter,
  Save,
  Download,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building,
  HelpCircle,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  Produto,
  listarProdutos,
  salvarProduto,
  obterProdutoPorId,
  verificarPendenciasFiscaisProduto,
  extrairCamposFiscaisDoPerfil,
} from '@/services/produtos'
import { RegimeApuracao } from '@/services/empresas'
import { sugerirCestPorNcm } from '@/services/cest'
import {
  obterPerfilTributarioCompleto,
  listarTodosPerfisAtivos,
  PerfilTributario,
} from '@/services/perfisTributarios'
import { SelectNcm } from '@/components/SelectNcm'
import { SelectCest } from '@/components/SelectCest'
import { SelectCodigoFiscal } from '@/components/SelectCodigoFiscal'
import { SelectCfop } from '@/components/SelectCfop'
import { SelectPerfilTributario } from '@/components/SelectPerfilTributario'

import { sugerirTributacao, NivelConfiancaSugestao } from '@/services/motorFiscal'

// Tipo de pendência fiscal para filtro
type TipoPendenciaFiltro =
  | 'todas'
  | 'pendentes_geral'
  | 'criados_por_entrada_nota'
  | 'sem_ncm'
  | 'sem_cest_sugerido'
  | 'sem_tributacao_icms'
  | 'nao_revisado'

export const ConferenciaFiscalPage: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { pode, administrador } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()

  const podeEditar = administrador || pode('produtos', 'editar')

  const crtEmpresa = empresaAtiva?.crt ?? 1
  const regimeEmpresa: 'Simples Nacional' | 'Regime Normal' =
    crtEmpresa === 3 ? 'Regime Normal' : 'Simples Nacional'

  // Estados de dados e filtros
  const [carregando, setCarregando] = useState(true)
  const [salvandoLote, setSalvandoLote] = useState(false)
  const [produtosOriginais, setProdutosOriginais] = useState<Produto[]>([])
  // Linhas editadas na grade: mapa de produtoId -> campos alterados
  const [alteracoesGrade, setAlteracoesGrade] = useState<Record<string, Partial<Produto>>>({})
  // Mapa de NCMs que possuem CEST sugerido no sistema
  const [cestsSugeridosMap, setCestsSugeridosMap] = useState<Record<string, boolean>>({})
  // Mapa de confiança da sugestão fiscal calculada para cada produto (Alta / Média / Baixa / '-')
  const [confiancaMap, setConfiancaMap] = useState<
    Record<string, { nivel: NivelConfiancaSugestao | '-'; motivo: string }>
  >({})

  // Filtros
  const [filtroPendencia, setFiltroPendencia] = useState<TipoPendenciaFiltro>('pendentes_geral')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [itensPorPagina] = useState(25)
  const [totalItens, setTotalItens] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)

  // Seleção de produtos na grade para ações em massa
  const [selecionados, setSelecionados] = useState<string[]>([])

  // Modal Aplicar Perfil Tributário
  const [modalPerfilAberto, setModalPerfilAberto] = useState(false)
  const [perfilSelecionadoId, setPerfilSelecionadoId] = useState<string>('')
  const [aplicandoPerfil, setAplicandoPerfil] = useState(false)

  // Modal Importar CSV
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [arquivoCSV, setArquivoCSV] = useState<File | null>(null)
  const [previaImportacao, setPreviaImportacao] = useState<{
    totalLinhas: number
    modificados: {
      produtoId: string
      codigo: number
      descricao: string
      antes: Partial<Produto>
      depois: Partial<Produto>
    }[]
    erros: string[]
  } | null>(null)
  const [processandoCSV, setProcessandoCSV] = useState(false)

  // Carregar produtos e calcular sugestões de CEST
  const carregarProdutos = useCallback(async () => {
    setCarregando(true)
    try {
      // Buscar produtos
      const paramsBusca: any = {
        pagina,
        itensPorPagina,
        ordenacao: 'codigo',
        situacao: 'ativos',
      }

      if (busca.trim()) {
        paramsBusca.busca = busca.trim()
      }

      // Parâmetros rápidos quando aplicáveis no backend
      if (filtroPendencia === 'sem_ncm') {
        paramsBusca.sem_ncm = true
      } else if (filtroPendencia === 'nao_revisado') {
        paramsBusca.fiscal_nao_revisado = true
      } else if (filtroPendencia === 'criados_por_entrada_nota') {
        paramsBusca.criados_por_entrada_nota = true
      }

      const res = await listarProdutos(paramsBusca)
      setProdutosOriginais(res.items)
      setTotalItens(res.totalItems)
      setTotalPaginas(res.totalPages)

      // Identificar quais produtos têm NCM com CEST sugerido
      const mapaCest: Record<string, boolean> = {}
      const ncmsUnicos = Array.from(
        new Set(res.items.map((p) => p.ncm).filter(Boolean)),
      ) as string[]

      await Promise.all(
        ncmsUnicos.map(async (ncm) => {
          try {
            const sugestoes = await sugerirCestPorNcm(ncm)
            if (sugestoes.length > 0) {
              mapaCest[ncm] = true
            }
          } catch {
            // tolera falha na verificação de sugestão
          }
        }),
      )
      setCestsSugeridosMap(mapaCest)

      // Calcular Confiança da Sugestão Fiscal para os produtos
      const mapaConfianca: Record<string, { nivel: NivelConfiancaSugestao | '-'; motivo: string }> =
        {}
      const empresaParaMotor = {
        id: empresaAtiva?.id,
        uf: empresaAtiva?.uf || 'ES',
        crt: empresaAtiva?.crt ?? 1,
        regime_apuracao: (regimeEmpresa === 'Regime Normal'
          ? 'Lucro Presumido'
          : 'Simples Nacional') as RegimeApuracao,
      }

      await Promise.all(
        res.items.map(async (p) => {
          try {
            if (p.fiscal_revisado) {
              mapaConfianca[p.id] = { nivel: 'Alta', motivo: 'Produto revisado pelo contador' }
              return
            }

            const cleanNcm = (p.ncm || '').replace(/\D/g, '')
            if (!cleanNcm) {
              mapaConfianca[p.id] = { nivel: 'Baixa', motivo: 'Sem NCM preenchido' }
              return
            }

            const sugestao = await sugerirTributacao({
              empresa: empresaParaMotor,
              produtoExistente: p,
            })

            mapaConfianca[p.id] = {
              nivel: sugestao.confianca,
              motivo: sugestao.motivoGeral,
            }
          } catch {
            mapaConfianca[p.id] = { nivel: 'Baixa', motivo: 'Não foi possível consultar motor' }
          }
        }),
      )
      setConfiancaMap(mapaConfianca)
    } catch (err) {
      console.error('Erro ao carregar produtos para conferência:', err)
      toast({
        title: 'Erro ao listar produtos',
        description: 'Não foi possível carregar a lista de produtos para conferência fiscal.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [pagina, itensPorPagina, busca, filtroPendencia, regimeEmpresa, empresaAtiva, toast])

  useEffect(() => {
    carregarProdutos()
  }, [carregarProdutos])

  // Produtos combinados com edições locais da grade
  const produtosNaGrade = useMemo(() => {
    return produtosOriginais.map((prod) => {
      const editado = alteracoesGrade[prod.id]
      if (!editado) return prod
      return {
        ...prod,
        ...editado,
      }
    })
  }, [produtosOriginais, alteracoesGrade])

  // Filtro em memória de pendências específicas
  const produtosFiltrados = useMemo(() => {
    return produtosNaGrade.filter((p) => {
      const temCestSugeridoPendente = Boolean(p.ncm && !p.cest && cestsSugeridosMap[p.ncm])
      const info = verificarPendenciasFiscaisProduto(p, regimeEmpresa, temCestSugeridoPendente)

      if (filtroPendencia === 'todas') return true
      if (filtroPendencia === 'pendentes_geral') return info.temPendencia
      if (filtroPendencia === 'criados_por_entrada_nota') {
        return (p.observacoes || '').includes('Criado automaticamente pela NF')
      }
      if (filtroPendencia === 'sem_ncm') return info.semNcm
      if (filtroPendencia === 'sem_cest_sugerido') return info.semCestSugerido
      if (filtroPendencia === 'sem_tributacao_icms') return info.semTributacaoIcms
      if (filtroPendencia === 'nao_revisado') return info.naoRevisado
      return true
    })
  }, [produtosNaGrade, filtroPendencia, regimeEmpresa, cestsSugeridosMap])

  // Altera um campo na grade para um produto
  const handleAlterarCampoGrade = (produtoId: string, campo: keyof Produto, valor: any) => {
    setAlteracoesGrade((prev) => {
      const existente = prev[produtoId] || {}
      return {
        ...prev,
        [produtoId]: {
          ...existente,
          [campo]: valor,
          // Sempre que editar qualquer campo fiscal na grade, desmarca fiscal_revisado
          fiscal_revisado: false,
        },
      }
    })
  }

  // Marcar como revisado diretamente
  const handleToggleFiscalRevisado = (produtoId: string, marcado: boolean) => {
    setAlteracoesGrade((prev) => {
      const existente = prev[produtoId] || {}
      return {
        ...prev,
        [produtoId]: {
          ...existente,
          fiscal_revisado: marcado,
          fiscal_revisado_em: marcado ? new Date().toISOString() : '',
        },
      }
    })
  }

  // Verifica se o produto tem alterações pendentes de salvar
  const temAlteracaoPendente = (produtoId: string) => {
    return Boolean(alteracoesGrade[produtoId])
  }

  const totalAlterados = Object.keys(alteracoesGrade).length

  // Descartar alterações
  const handleDescartarAlteracoes = () => {
    setAlteracoesGrade({})
    toast({
      title: 'Alterações descartadas',
      description: 'As modificações não salvas foram descartadas.',
    })
  }

  // Salvar alterações da grade em lote gravando auditoria
  const handleSalvarLote = async () => {
    if (totalAlterados === 0) return

    setSalvandoLote(true)
    let sucessos = 0
    let falhas = 0

    try {
      const ids = Object.keys(alteracoesGrade)
      for (const id of ids) {
        const modificacoes = alteracoesGrade[id]
        try {
          await salvarProduto({
            id,
            ...modificacoes,
          })
          sucessos++
        } catch (err) {
          console.error(`Erro ao salvar produto ${id}:`, err)
          falhas++
        }
      }

      if (falhas === 0) {
        toast({
          title: 'Conferência gravada com sucesso',
          description: `${sucessos} produto(s) atualizado(s) no banco de dados e auditados.`,
        })
        setAlteracoesGrade({})
        carregarProdutos()
      } else {
        toast({
          title: 'Concluído com avisos',
          description: `${sucessos} produto(s) salvos e ${falhas} falha(s). Verifique os dados.`,
          variant: 'destructive',
        })
        carregarProdutos()
      }
    } catch (err) {
      console.error('Erro geral ao salvar em lote:', err)
      toast({
        title: 'Erro ao gravar lote',
        description: 'Falha durante o processamento de gravação em lote.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoLote(false)
    }
  }

  // Marcar todos os selecionados como revisados
  const handleMarcarSelecionadosComoRevisados = () => {
    if (selecionados.length === 0) return

    setAlteracoesGrade((prev) => {
      const novo = { ...prev }
      selecionados.forEach((id) => {
        novo[id] = {
          ...(novo[id] || {}),
          fiscal_revisado: true,
          fiscal_revisado_em: new Date().toISOString(),
        }
      })
      return novo
    })

    toast({
      title: 'Marcados como revisados na grade',
      description: `${selecionados.length} produto(s) alterados. Clique em "Salvar alterações" para gravar.`,
    })
  }

  // Ação em Massa: Aplicar Perfil Tributário aos selecionados
  const handleAplicarPerfilEmMassa = async () => {
    if (!perfilSelecionadoId || selecionados.length === 0) return

    setAplicandoPerfil(true)
    try {
      const perfilCompleto = await obterPerfilTributarioCompleto(perfilSelecionadoId)
      if (!perfilCompleto) {
        toast({
          title: 'Perfil não encontrado',
          description: 'Não foi possível carregar os dados do perfil selecionado.',
          variant: 'destructive',
        })
        return
      }

      const camposDoPerfil = extrairCamposFiscaisDoPerfil(perfilCompleto)

      // Atualiza a grade local com os campos extraídos
      setAlteracoesGrade((prev) => {
        const novo = { ...prev }
        selecionados.forEach((id) => {
          novo[id] = {
            ...(novo[id] || {}),
            ...camposDoPerfil,
          }
        })
        return novo
      })

      toast({
        title: 'Perfil tributário aplicado na grade',
        description: `O perfil "${perfilCompleto.nome}" foi aplicado a ${selecionados.length} produto(s). Clique em "Salvar alterações" para persistir no banco.`,
      })

      setModalPerfilAberto(false)
      setPerfilSelecionadoId('')
    } catch (err) {
      console.error('Erro ao aplicar perfil em lote:', err)
      toast({
        title: 'Erro ao aplicar perfil',
        description: 'Não foi possível aplicar o perfil tributário selecionado.',
        variant: 'destructive',
      })
    } finally {
      setAplicandoPerfil(false)
    }
  }

  // Exportar CSV de conferência fiscal
  const handleExportarCSV = () => {
    try {
      // Cabeçalho compatível com importação
      const cabecalho = [
        'codigo',
        'descricao',
        'ncm',
        'cest',
        'origem',
        'cst_icms',
        'csosn',
        'cfop_venda_interna',
        'aliquota_icms',
        'aliquota_icms_st',
        'aliquota_ipi',
        'aliquota_pis',
        'aliquota_cofins',
        'fiscal_revisado',
      ]

      const linhas = produtosFiltrados.map((p) => {
        return [
          p.codigo,
          `"${(p.descricao || '').replace(/"/g, '""')}"`,
          p.ncm || '',
          p.cest || '',
          p.origem !== undefined && p.origem !== null ? p.origem : '',
          p.cst_icms || '',
          p.csosn || '',
          p.cfop_venda_interna || '',
          p.aliquota_icms ?? '',
          p.aliquota_icms_st ?? '',
          p.aliquota_ipi ?? '',
          p.aliquota_pis ?? '',
          p.aliquota_cofins ?? '',
          p.fiscal_revisado ? '1' : '0',
        ].join(';')
      })

      const csvContent = '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\r\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute(
        'download',
        `conferencia_fiscal_produtos_${new Date().toISOString().substring(0, 10)}.csv`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: 'CSV exportado com sucesso',
        description: `${produtosFiltrados.length} produto(s) exportado(s) para conferência com a contabilidade.`,
      })
    } catch (err) {
      console.error('Erro ao exportar CSV:', err)
      toast({
        title: 'Erro na exportação',
        description: 'Não foi possível gerar o arquivo CSV de conferência.',
        variant: 'destructive',
      })
    }
  }

  // Processar arquivo CSV carregado para prévia
  const handleProcessarCSV = async (file: File) => {
    setProcessandoCSV(true)
    setPreviaImportacao(null)

    try {
      const texto = await file.text()
      const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0)

      if (linhas.length < 2) {
        toast({
          title: 'Arquivo vazio ou inválido',
          description: 'O CSV informado não contém linhas de produtos.',
          variant: 'destructive',
        })
        setProcessandoCSV(false)
        return
      }

      const delimitador = linhas[0].includes(';') ? ';' : ','
      const cabecalho = linhas[0].split(delimitador).map((h) =>
        h
          .trim()
          .replace(/^["']|["']$/g, '')
          .toLowerCase(),
      )

      const idxCodigo = cabecalho.indexOf('codigo')
      const idxNcm = cabecalho.indexOf('ncm')
      const idxCest = cabecalho.indexOf('cest')
      const idxOrigem = cabecalho.indexOf('origem')
      const idxCst = cabecalho.indexOf('cst_icms')
      const idxCsosn = cabecalho.indexOf('csosn')
      const idxCfop = cabecalho.indexOf('cfop_venda_interna')
      const idxAliqIcms = cabecalho.indexOf('aliquota_icms')
      const idxAliqIcmsSt = cabecalho.indexOf('aliquota_icms_st')
      const idxAliqIpi = cabecalho.indexOf('aliquota_ipi')
      const idxAliqPis = cabecalho.indexOf('aliquota_pis')
      const idxAliqCofins = cabecalho.indexOf('aliquota_cofins')
      const idxRevisado = cabecalho.indexOf('fiscal_revisado')

      if (idxCodigo === -1) {
        toast({
          title: 'Coluna "codigo" ausente',
          description:
            'O arquivo CSV precisa ter o cabeçalho com a coluna "codigo" para identificação dos produtos.',
          variant: 'destructive',
        })
        setProcessandoCSV(false)
        return
      }

      const modificados: any[] = []
      const erros: string[] = []

      // Buscar todos os produtos do ERP para cruzamento rápido por código
      const todosProds = await listarProdutos({ itensPorPagina: 500, situacao: 'todos' })
      const mapaProdutosPorCodigo = new Map<number, Produto>()
      todosProds.items.forEach((p) => mapaProdutosPorCodigo.set(p.codigo, p))

      for (let i = 1; i < linhas.length; i++) {
        const linhaNum = i + 1
        const linha = linhas[i].trim()
        if (!linha) continue

        const colunas = linha.split(delimitador).map((c) => c.trim().replace(/^["']|["']$/g, ''))
        const codStr = colunas[idxCodigo]
        const codNum = Number(codStr)

        if (isNaN(codNum)) {
          erros.push(`Linha ${linhaNum}: código "${codStr}" não é numérico.`)
          continue
        }

        const produtoExistente = mapaProdutosPorCodigo.get(codNum)
        if (!produtoExistente) {
          erros.push(
            `Linha ${linhaNum}: produto com código #${codNum} não foi encontrado no sistema.`,
          )
          continue
        }

        const novosCampos: Partial<Produto> = {}
        if (idxNcm !== -1 && colunas[idxNcm] !== undefined) novosCampos.ncm = colunas[idxNcm]
        if (idxCest !== -1 && colunas[idxCest] !== undefined) novosCampos.cest = colunas[idxCest]
        if (idxOrigem !== -1 && colunas[idxOrigem] !== undefined)
          novosCampos.origem = colunas[idxOrigem]
        if (idxCst !== -1 && colunas[idxCst] !== undefined) novosCampos.cst_icms = colunas[idxCst]
        if (idxCsosn !== -1 && colunas[idxCsosn] !== undefined)
          novosCampos.csosn = colunas[idxCsosn]
        if (idxCfop !== -1 && colunas[idxCfop] !== undefined)
          novosCampos.cfop_venda_interna = colunas[idxCfop]

        if (idxAliqIcms !== -1 && colunas[idxAliqIcms] !== '')
          novosCampos.aliquota_icms = Number(colunas[idxAliqIcms].replace(',', '.'))
        if (idxAliqIcmsSt !== -1 && colunas[idxAliqIcmsSt] !== '')
          novosCampos.aliquota_icms_st = Number(colunas[idxAliqIcmsSt].replace(',', '.'))
        if (idxAliqIpi !== -1 && colunas[idxAliqIpi] !== '')
          novosCampos.aliquota_ipi = Number(colunas[idxAliqIpi].replace(',', '.'))
        if (idxAliqPis !== -1 && colunas[idxAliqPis] !== '')
          novosCampos.aliquota_pis = Number(colunas[idxAliqPis].replace(',', '.'))
        if (idxAliqCofins !== -1 && colunas[idxAliqCofins] !== '')
          novosCampos.aliquota_cofins = Number(colunas[idxAliqCofins].replace(',', '.'))

        if (idxRevisado !== -1 && colunas[idxRevisado] !== '') {
          const revVal = colunas[idxRevisado].toLowerCase()
          novosCampos.fiscal_revisado = revVal === '1' || revVal === 'true' || revVal === 'sim'
        }

        modificados.push({
          produtoId: produtoExistente.id,
          codigo: produtoExistente.codigo,
          descricao: produtoExistente.descricao,
          antes: {
            ncm: produtoExistente.ncm,
            cest: produtoExistente.cest,
            origem: produtoExistente.origem,
            cst_icms: produtoExistente.cst_icms,
            csosn: produtoExistente.csosn,
            cfop_venda_interna: produtoExistente.cfop_venda_interna,
            aliquota_icms: produtoExistente.aliquota_icms,
            aliquota_icms_st: produtoExistente.aliquota_icms_st,
            aliquota_ipi: produtoExistente.aliquota_ipi,
            aliquota_pis: produtoExistente.aliquota_pis,
            aliquota_cofins: produtoExistente.aliquota_cofins,
            fiscal_revisado: produtoExistente.fiscal_revisado,
          },
          depois: novosCampos,
        })
      }

      setPreviaImportacao({
        totalLinhas: linhas.length - 1,
        modificados,
        erros,
      })
    } catch (err) {
      console.error('Erro ao ler arquivo CSV:', err)
      toast({
        title: 'Erro ao processar CSV',
        description: 'Falha ao analisar a estrutura do arquivo CSV.',
        variant: 'destructive',
      })
    } finally {
      setProcessandoCSV(false)
    }
  }

  // Confirmar aplicação da importação do CSV na grade
  const handleConfirmarImportacaoCSV = () => {
    if (!previaImportacao) return

    setAlteracoesGrade((prev) => {
      const novo = { ...prev }
      previaImportacao.modificados.forEach((item) => {
        novo[item.produtoId] = {
          ...(novo[item.produtoId] || {}),
          ...item.depois,
        }
      })
      return novo
    })

    toast({
      title: 'Importação carregada na grade',
      description: `${previaImportacao.modificados.length} produto(s) atualizado(s) na grade. Clique em "Salvar alterações" para gravar definitivamente no banco.`,
    })

    setModalImportarAberto(false)
    setArquivoCSV(null)
    setPreviaImportacao(null)
  }

  // Toggle de seleção de todos
  const handleToggleSelecionarTudo = () => {
    if (selecionados.length === produtosFiltrados.length && produtosFiltrados.length > 0) {
      setSelecionados([])
    } else {
      setSelecionados(produtosFiltrados.map((p) => p.id))
    }
  }

  const handleToggleItem = (id: string) => {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-5 pb-12">
      {/* Topo / Cabeçalho da página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/cadastros/produtos')}
              className="h-8 px-2 text-slate-500 hover:text-slate-800"
              title="Voltar para a lista de produtos"
            >
              <ArrowLeft size={16} />
            </Button>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Conferência Fiscal de Produtos</span>
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                Grade em massa
              </Badge>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-8">
            Identifique pendências fiscais, preencha NCM, CEST, CST/CSOSN, CFOP e alíquotas
            diretamente na grade e envie para a contabilidade.
          </p>
        </div>

        {/* Botões de Ações do topo */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarProdutos}
            disabled={carregando}
            className="text-xs h-9 border-slate-200 text-slate-700 hover:bg-slate-100"
            title="Recarregar produtos"
          >
            <RefreshCw size={14} className={`mr-1.5 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarCSV}
            disabled={produtosFiltrados.length === 0}
            className="text-xs h-9 border-slate-200 text-slate-700 hover:bg-slate-100"
            title="Exportar dados para enviar ao contador"
          >
            <Download size={14} className="mr-1.5 text-emerald-600" />
            Exportar CSV
          </Button>

          {podeEditar && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setArquivoCSV(null)
                  setPreviaImportacao(null)
                  setModalImportarAberto(true)
                }}
                className="text-xs h-9 border-slate-200 text-slate-700 hover:bg-slate-100"
                title="Importar CSV corrigido pelo contador"
              >
                <Upload size={14} className="mr-1.5 text-blue-600" />
                Importar CSV
              </Button>

              {totalAlterados > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDescartarAlteracoes}
                    disabled={salvandoLote}
                    className="text-xs h-9 text-slate-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    Descartar ({totalAlterados})
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleSalvarLote}
                    disabled={salvandoLote}
                    className="text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
                  >
                    {salvandoLote ? (
                      <>
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                        Gravando...
                      </>
                    ) : (
                      <>
                        <Save size={14} className="mr-1.5" />
                        Salvar alterações ({totalAlterados})
                      </>
                    )}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Busca textual */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <Input
              type="text"
              placeholder="Buscar por código, descrição, NCM ou referência..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Seletor de Tipo de Pendência */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Filter size={14} className="text-slate-400" />
              Filtrar por:
            </span>
            <Select
              value={filtroPendencia}
              onValueChange={(val: TipoPendenciaFiltro) => {
                setFiltroPendencia(val)
                setPagina(1)
              }}
            >
              <SelectTrigger className="h-9 text-xs min-w-[220px] bg-slate-50 border-slate-200">
                <SelectValue placeholder="Tipo de pendência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendentes_geral">Todas as Pendências Fiscais</SelectItem>
                <SelectItem value="criados_por_entrada_nota">
                  Criados pela entrada de notas
                </SelectItem>
                <SelectItem value="sem_ncm">Sem NCM preenchido</SelectItem>
                <SelectItem value="sem_cest_sugerido">
                  Sem CEST (mas possui NCM c/ sugestão)
                </SelectItem>
                <SelectItem value="sem_tributacao_icms">Sem CST/CSOSN de ICMS</SelectItem>
                <SelectItem value="nao_revisado">Não Revisados pelo Contador</SelectItem>
                <SelectItem value="todas">Todos os produtos (sem filtro)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Destaque do regime tributário da empresa ativa */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <Building size={13} className="text-slate-400" />
            <span>
              Regime Tributário ativo: <strong className="text-slate-800">{regimeEmpresa}</strong>{' '}
              (CRT {crtEmpresa})
            </span>
          </div>
          <div>
            Mostrando <strong>{produtosFiltrados.length}</strong> produto(s) nesta página
          </div>
        </div>
      </div>

      {/* Barra de Ações em Massa para produtos selecionados */}
      {selecionados.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs text-blue-900 font-medium">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <span>
              <strong>{selecionados.length}</strong> produto(s) selecionado(s)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {podeEditar && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setModalPerfilAberto(true)}
                  className="h-8 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50 font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                  Aplicar Perfil Tributário
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarcarSelecionadosComoRevisados}
                  className="h-8 text-xs bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-medium"
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                  Marcar como Revisados
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelecionados([])}
              className="h-8 text-xs text-slate-500 hover:text-slate-800"
            >
              Desmarcar todos
            </Button>
          </div>
        </div>
      )}

      {/* Grade Editável em Massa */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px] shadow-2xs">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={
                      produtosFiltrados.length > 0 &&
                      selecionados.length === produtosFiltrados.length
                    }
                    onChange={handleToggleSelecionarTudo}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Selecionar todos os produtos da página"
                  />
                </th>
                <th className="py-2.5 px-2 w-16 text-center">Código</th>
                <th className="py-2.5 px-3 min-w-[200px]">Identificação / Produto</th>
                <th className="py-2.5 px-2 w-28 text-center">Confiança</th>
                <th className="py-2.5 px-2 min-w-[150px]">NCM</th>
                <th className="py-2.5 px-2 min-w-[130px]">CEST</th>
                <th className="py-2.5 px-2 w-28">Origem</th>
                <th className="py-2.5 px-2 w-28">
                  {regimeEmpresa === 'Simples Nacional' ? 'CSOSN' : 'CST ICMS'}
                </th>
                <th className="py-2.5 px-2 w-28">CFOP Venda</th>
                <th className="py-2.5 px-2 w-20 text-right">% ICMS</th>
                <th className="py-2.5 px-2 w-20 text-right">% ICMS ST</th>
                <th className="py-2.5 px-2 w-20 text-right">% IPI</th>
                <th className="py-2.5 px-2 w-20 text-right">% PIS</th>
                <th className="py-2.5 px-2 w-20 text-right">% COFINS</th>
                <th className="py-2.5 px-3 w-28 text-center">Fiscal Revisado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span>Carregando dados fiscais dos produtos...</span>
                    </div>
                  </td>
                </tr>
              ) : produtosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-16 text-center text-slate-500">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-slate-800 text-sm">
                      Nenhuma pendência fiscal encontrada com o filtro selecionado!
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Todos os produtos atendem aos critérios ou altere o filtro para visualizar
                      outros registros.
                    </p>
                  </td>
                </tr>
              ) : (
                produtosFiltrados.map((p) => {
                  const editado = temAlteracaoPendente(p.id)
                  const isChecked = selecionados.includes(p.id)
                  const temCestSugeridoPendente = Boolean(
                    p.ncm && !p.cest && cestsSugeridosMap[p.ncm],
                  )
                  const info = verificarPendenciasFiscaisProduto(
                    p,
                    regimeEmpresa,
                    temCestSugeridoPendente,
                  )

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        editado ? 'bg-amber-50/50' : ''
                      } ${isChecked ? 'bg-blue-50/40' : ''}`}
                    >
                      {/* Checkbox de seleção */}
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleItem(p.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Código do produto */}
                      <td className="py-2 px-2 text-center font-mono text-slate-600 font-semibold">
                        #{p.codigo}
                      </td>

                      {/* Identificação (descrição, marca, grupo) + Indicadores visuais */}
                      <td className="py-2 px-3">
                        <div className="flex flex-col">
                          <span
                            className="font-medium text-slate-900 line-clamp-1"
                            title={p.descricao}
                          >
                            {p.descricao}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 flex-wrap">
                            {p.expand?.marca_id && (
                              <span className="bg-slate-100 px-1 py-0.2 rounded text-slate-600">
                                {p.expand.marca_id.nome}
                              </span>
                            )}
                            {p.expand?.grupo_id && (
                              <span className="text-slate-500">
                                {p.expand.grupo_id.nome}
                                {p.expand.categoria_id ? ` › ${p.expand.categoria_id.nome}` : ''}
                              </span>
                            )}
                          </div>

                          {/* Indicadores Visuais de Pendência */}
                          {info.temPendencia && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {info.semNcm && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 bg-rose-50 text-rose-700 border-rose-200"
                                >
                                  Sem NCM
                                </Badge>
                              )}
                              {info.semCestSugerido && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200"
                                >
                                  Sugestão CEST
                                </Badge>
                              )}
                              {info.semTributacaoIcms && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 bg-rose-50 text-rose-700 border-rose-200"
                                >
                                  Sem {regimeEmpresa === 'Simples Nacional' ? 'CSOSN' : 'CST'}
                                </Badge>
                              )}
                              {info.naoRevisado && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 bg-slate-100 text-slate-600 border-slate-200"
                                >
                                  Não revisado
                                </Badge>
                              )}
                              {(p.observacoes || '').includes('Criado automaticamente pela NF') && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 bg-indigo-50 text-indigo-700 border-indigo-200"
                                >
                                  Via NF-e
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Coluna Confiança da Sugestão Fiscal */}
                      <td className="py-2 px-2 text-center">
                        {(() => {
                          const conf = confiancaMap[p.id]
                          const nivel = conf?.nivel ?? 'Baixa'
                          const motivo = conf?.motivo ?? ''

                          let badgeColor = 'bg-slate-100 text-slate-600 border-slate-200'
                          if (nivel === 'Alta') {
                            badgeColor =
                              'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                          } else if (nivel === 'Média') {
                            badgeColor = 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                          } else if (nivel === 'Baixa') {
                            badgeColor = 'bg-rose-50 text-rose-700 border-rose-200'
                          }

                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block cursor-help">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-2 py-0.5 ${badgeColor}`}
                                  >
                                    {nivel}
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs">
                                <p className="font-semibold">Confiança da sugestão: {nivel}</p>
                                {motivo && (
                                  <p className="text-slate-300 text-[11px] mt-0.5">{motivo}</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          )
                        })()}
                      </td>

                      {/* NCM (Editável c/ seletor) */}
                      <td className="py-1 px-1">
                        <SelectNcm
                          value={p.ncm || ''}
                          onChange={(cod) => handleAlterarCampoGrade(p.id, 'ncm', cod)}
                          placeholder="NCM..."
                          className="h-8 text-xs font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* CEST (Editável c/ seletor) */}
                      <td className="py-1 px-1">
                        <SelectCest
                          value={p.cest || ''}
                          ncmVinculado={p.ncm || ''}
                          onChange={(cod) => handleAlterarCampoGrade(p.id, 'cest', cod)}
                          placeholder="CEST..."
                          className="h-8 text-xs font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* Origem (Editável c/ seletor de códigos fiscais) */}
                      <td className="py-1 px-1">
                        <SelectCodigoFiscal
                          tipo="ORIGEM"
                          value={
                            p.origem !== undefined && p.origem !== null ? String(p.origem) : ''
                          }
                          onChange={(cod) => handleAlterarCampoGrade(p.id, 'origem', cod)}
                          placeholder="Origem..."
                          className="h-8 text-xs"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* CST ICMS ou CSOSN conforme regime */}
                      <td className="py-1 px-1">
                        {regimeEmpresa === 'Simples Nacional' ? (
                          <SelectCodigoFiscal
                            tipo="CSOSN"
                            value={p.csosn || ''}
                            onChange={(cod) => handleAlterarCampoGrade(p.id, 'csosn', cod)}
                            placeholder="CSOSN..."
                            className="h-8 text-xs font-mono"
                            disabled={!podeEditar}
                          />
                        ) : (
                          <SelectCodigoFiscal
                            tipo="CST_ICMS"
                            value={p.cst_icms || ''}
                            onChange={(cod) => handleAlterarCampoGrade(p.id, 'cst_icms', cod)}
                            placeholder="CST..."
                            className="h-8 text-xs font-mono"
                            disabled={!podeEditar}
                          />
                        )}
                      </td>

                      {/* CFOP Venda Interna */}
                      <td className="py-1 px-1">
                        <SelectCfop
                          tipoMovimento="Saída"
                          value={p.cfop_venda_interna || ''}
                          onChange={(cod) =>
                            handleAlterarCampoGrade(p.id, 'cfop_venda_interna', cod)
                          }
                          placeholder="CFOP..."
                          className="h-8 text-xs font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* % Alíquota ICMS */}
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={
                            p.aliquota_icms !== undefined && p.aliquota_icms !== null
                              ? p.aliquota_icms
                              : ''
                          }
                          onChange={(e) =>
                            handleAlterarCampoGrade(
                              p.id,
                              'aliquota_icms',
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                          placeholder="0,00"
                          className="h-8 text-xs text-right font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* % Alíquota ICMS ST */}
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={
                            p.aliquota_icms_st !== undefined && p.aliquota_icms_st !== null
                              ? p.aliquota_icms_st
                              : ''
                          }
                          onChange={(e) =>
                            handleAlterarCampoGrade(
                              p.id,
                              'aliquota_icms_st',
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                          placeholder="0,00"
                          className="h-8 text-xs text-right font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* % Alíquota IPI */}
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={
                            p.aliquota_ipi !== undefined && p.aliquota_ipi !== null
                              ? p.aliquota_ipi
                              : ''
                          }
                          onChange={(e) =>
                            handleAlterarCampoGrade(
                              p.id,
                              'aliquota_ipi',
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                          placeholder="0,00"
                          className="h-8 text-xs text-right font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* % Alíquota PIS */}
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={
                            p.aliquota_pis !== undefined && p.aliquota_pis !== null
                              ? p.aliquota_pis
                              : ''
                          }
                          onChange={(e) =>
                            handleAlterarCampoGrade(
                              p.id,
                              'aliquota_pis',
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                          placeholder="0,00"
                          className="h-8 text-xs text-right font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* % Alíquota COFINS */}
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={
                            p.aliquota_cofins !== undefined && p.aliquota_cofins !== null
                              ? p.aliquota_cofins
                              : ''
                          }
                          onChange={(e) =>
                            handleAlterarCampoGrade(
                              p.id,
                              'aliquota_cofins',
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                          placeholder="0,00"
                          className="h-8 text-xs text-right font-mono"
                          disabled={!podeEditar}
                        />
                      </td>

                      {/* Fiscal Revisado */}
                      <td className="py-2 px-3 text-center">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(p.fiscal_revisado)}
                            onChange={(e) => handleToggleFiscalRevisado(p.id, e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer h-4 w-4"
                            disabled={!podeEditar}
                          />
                          <span
                            className={`text-[11px] font-medium ${
                              p.fiscal_revisado ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {p.fiscal_revisado ? 'Sim' : 'Não'}
                          </span>
                        </label>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Grade com Paginação */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong> (total de{' '}
            <strong>{totalItens}</strong> produtos cadastrados)
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((prev) => Math.max(1, prev - 1))}
              disabled={pagina <= 1 || carregando}
              className="h-8 px-2.5 text-xs bg-white"
            >
              <ChevronLeft size={14} className="mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagina((prev) => Math.min(totalPaginas, prev + 1))}
              disabled={pagina >= totalPaginas || carregando}
              className="h-8 px-2.5 text-xs bg-white"
            >
              Próxima
              <ChevronRight size={14} className="ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: Aplicar Perfil Tributário em Massa                                 */}
      {/* ========================================================================= */}
      <Dialog open={modalPerfilAberto} onOpenChange={setModalPerfilAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Aplicar Perfil Tributário em Massa
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escolha um perfil para aplicar suas alíquotas, CFOPs e parâmetros fiscais aos{' '}
              <strong>{selecionados.length}</strong> produto(s) selecionado(s).
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Selecione o perfil tributário
              </Label>
              <SelectPerfilTributario
                value={perfilSelecionadoId}
                onChange={(id) => setPerfilSelecionadoId(id || '')}
                placeholder="Selecione o modelo fiscal..."
              />
            </div>
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
              Atenção: Os campos fiscais da grade (Origem, CFOPs, CST/CSOSN e alíquotas) serão
              substituídos pelos dados do perfil escolhido para todos os produtos marcados.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setModalPerfilAberto(false)}
              className="text-xs h-9"
              disabled={aplicandoPerfil}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAplicarPerfilEmMassa}
              disabled={!perfilSelecionadoId || aplicandoPerfil}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {aplicandoPerfil ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  Aplicando...
                </>
              ) : (
                'Aplicar aos selecionados'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: Importar CSV com Conferência Fiscal                                */}
      {/* ========================================================================= */}
      <Dialog open={modalImportarAberto} onOpenChange={setModalImportarAberto}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Importar Planilha CSV da Contabilidade
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Envie o arquivo CSV com as correções sugeridas pelo contador. As alterações serão
              exibidas para sua conferência antes de salvar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Input de Arquivo */}
            <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg text-center hover:bg-slate-50 transition-colors">
              <input
                type="file"
                accept=".csv,text/csv"
                id="csv-conferencia-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setArquivoCSV(f)
                    handleProcessarCSV(f)
                  }
                }}
              />
              <label htmlFor="csv-conferencia-input" className="cursor-pointer block">
                <FileSpreadsheet className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <span className="font-semibold text-slate-700 block">
                  {arquivoCSV ? arquivoCSV.name : 'Clique para selecionar o arquivo CSV'}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Formatos aceitos: CSV com separador vírgula ou ponto-e-vírgula
                </span>
              </label>
            </div>

            {processandoCSV && (
              <div className="p-6 text-center text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Analisando linhas do CSV...</span>
              </div>
            )}

            {/* Prévia das Alterações Identificadas */}
            {previaImportacao && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    Prévia: <strong>{previaImportacao.modificados.length}</strong> produtos com
                    alterações detectadas
                  </span>
                  {previaImportacao.erros.length > 0 && (
                    <Badge
                      variant="outline"
                      className="text-amber-700 bg-amber-50 border-amber-200 text-[10px]"
                    >
                      {previaImportacao.erros.length} aviso(s)
                    </Badge>
                  )}
                </div>

                {previaImportacao.erros.length > 0 && (
                  <div className="max-h-24 overflow-y-auto p-2 bg-amber-50 text-amber-800 rounded border border-amber-200 text-[11px] space-y-1">
                    {previaImportacao.erros.map((err, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                      <tr>
                        <th className="py-2 px-2.5">Código</th>
                        <th className="py-2 px-2.5">Produto</th>
                        <th className="py-2 px-2.5">Campos Modificados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previaImportacao.modificados.map((item) => (
                        <tr key={item.produtoId} className="hover:bg-slate-50/80">
                          <td className="py-2 px-2.5 font-mono text-slate-600 font-semibold">
                            #{item.codigo}
                          </td>
                          <td className="py-2 px-2.5 font-medium text-slate-800">
                            {item.descricao}
                          </td>
                          <td className="py-2 px-2.5 text-slate-600 font-mono text-[10px]">
                            {Object.entries(item.depois)
                              .map(([campo, val]) => `${campo}: ${val}`)
                              .join(' | ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setModalImportarAberto(false)
                setArquivoCSV(null)
                setPreviaImportacao(null)
              }}
              className="text-xs h-9"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarImportacaoCSV}
              disabled={!previaImportacao || previaImportacao.modificados.length === 0}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Carregar na Grade ({previaImportacao?.modificados.length || 0})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ConferenciaFiscalPage
