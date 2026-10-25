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
  Package,
  Users,
  ShoppingCart,
  FileSpreadsheet,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  PeriodoRelatorio,
  TipoAtalhoPeriodo,
  ChaveFiltroDeclaravel,
  ObjetoFiltrosRelatorio,
  OpcaoTipoData,
  calcularPeriodoPorAtalho,
  validarPeriodoMaximo366Dias,
  formatarDataBr,
  formatarDataHoraEmissao,
  formatarLinhaLegivelFiltros,
} from '@/services/relatorios'
import { MultiSelectFiltro, ItemOpcaoFiltro } from './MultiSelectFiltro'
import { GerenciadorFiltrosSalvos } from './GerenciadorFiltrosSalvos'
import pb from '@/lib/pocketbase/client'

// Interfaces de suporte
export interface FiltrosRelatorioProps {
  /** Identificador único do relatório (ex: 'vendas_consultas', 'estoque_posicao') para filtros salvos e catálogo */
  relatorioId?: string
  /** Título do relatório para o cabeçalho de impressão e identificação */
  tituloRelatorio?: string
  /** Subtítulo ou descrição curta */
  subtituloRelatorio?: string
  /** Se o relatório suporta a opção de incluir notas fiscais de homologação/teste */
  suportaNotasTeste?: boolean
  /** Lista de filtros específicos declarados que este relatório utiliza (apenas estes aparecem na tela) */
  filtrosDeclarados?: ChaveFiltroDeclaravel[]
  /** Estado atual dos filtros controlados no formato único `ObjetoFiltrosRelatorio` */
  filtros: ObjetoFiltrosRelatorio
  /** Callback quando qualquer filtro sofrer alteração */
  onChange: (novosFiltros: ObjetoFiltrosRelatorio) => void
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
  /** Conteúdo extra opcional */
  children?: React.ReactNode
  /** Seção extra de filtros complementares */
  filtrosExtras?: React.ReactNode
  /** Oculta o seletor padrão de período de datas quando o relatório usa data base pontual ou parâmetros próprios */
  ocultarPeriodo?: boolean
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
  relatorioId,
  tituloRelatorio,
  subtituloRelatorio,
  suportaNotasTeste = false,
  filtrosDeclarados,
  filtros,
  onChange,
  onFiltrar,
  onExportarCsv,
  onImprimir,
  carregando = false,
  desabilitado = false,
  children,
  filtrosExtras,
  ocultarPeriodo = false,
}) => {
  const { empresas, empresaAtiva } = useEmpresaAtiva()
  const [empresasAbertas, setEmpresasAbertas] = useState(false)
  const [extrasAbertos, setExtrasAbertos] = useState(true)
  const [dataHoraEmissao] = useState<string>(() => formatarDataHoraEmissao())

  // Cache das opções para os seletores
  const [opcoesGrupos, setOpcoesGrupos] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesCategorias, setOpcoesCategorias] = useState<
    (ItemOpcaoFiltro & { grupoId: string })[]
  >([])
  const [opcoesMarcas, setOpcoesMarcas] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesProdutos, setOpcoesProdutos] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesFornecedores, setOpcoesFornecedores] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesClientes, setOpcoesClientes] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesVendedores, setOpcoesVendedores] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesOperadoresCaixa, setOpcoesOperadoresCaixa] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesFormasPagamento, setOpcoesFormasPagamento] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesTerminais, setOpcoesTerminais] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesIntermediadores, setOpcoesIntermediadores] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesPlanoContas, setOpcoesPlanoContas] = useState<
    (ItemOpcaoFiltro & { contaPaiId?: string; natureza?: string })[]
  >([])
  const [opcoesCentrosCusto, setOpcoesCentrosCusto] = useState<ItemOpcaoFiltro[]>([])
  const [opcoesContasFinanceiras, setOpcoesContasFinanceiras] = useState<ItemOpcaoFiltro[]>([])

  // Helper para verificar se um filtro foi declarado pelo relatório
  const usaFiltro = useCallback(
    (chave: ChaveFiltroDeclaravel) => {
      if (!filtrosDeclarados) return true // Se não especificou, exibe conforme contexto
      return filtrosDeclarados.includes(chave)
    },
    [filtrosDeclarados],
  )

  // Inicializa a empresa ativa caso a lista esteja vazia
  useEffect(() => {
    if ((!filtros.empresas_ids || filtros.empresas_ids.length === 0) && empresaAtiva) {
      onChange({
        ...filtros,
        empresas_ids: [empresaAtiva.id],
      })
    }
  }, [empresaAtiva, filtros, onChange])

  // Inicializa o período caso vazio
  useEffect(() => {
    if (!filtros.periodo?.dataInicio || !filtros.periodo?.dataFim) {
      const p = calcularPeriodoPorAtalho(filtros.atalho_periodo || 'este_mes')
      onChange({
        ...filtros,
        atalho_periodo: filtros.atalho_periodo || 'este_mes',
        periodo: p,
      })
    }
  }, [filtros, onChange])

  // Carga assíncrona das opções dos cadastros vinculados
  useEffect(() => {
    let ativo = true
    async function carregarDadosFiltros() {
      try {
        // Grupos e Categorias
        if (usaFiltro('produto_grupos_categorias')) {
          const gList = await pb.collection('grupos').getFullList({
            filter: 'ativo = true',
            sort: 'codigo,nome',
            requestKey: null,
          })
          const cList = await pb.collection('categorias').getFullList({
            filter: 'ativo = true',
            sort: 'codigo,nome',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesGrupos(
              gList.map((g) => ({
                id: g.id,
                label: `${g.codigo ? `[${g.codigo}] ` : ''}${g.nome}`,
              })),
            )
            setOpcoesCategorias(
              cList.map((c) => ({
                id: c.id,
                label: `${c.codigo ? `[${c.codigo}] ` : ''}${c.nome}`,
                grupoId: c.grupo_id,
              })),
            )
          }
        }

        // Marcas
        if (usaFiltro('produto_marcas')) {
          const mList = await pb.collection('marcas').getFullList({
            filter: 'ativo = true',
            sort: 'nome',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesMarcas(mList.map((m) => ({ id: m.id, label: m.nome })))
          }
        }

        // Produtos (código, descrição, código de barras)
        if (usaFiltro('produto_produtos')) {
          const pList = await pb.collection('produtos').getFullList({
            sort: 'descricao',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesProdutos(
              pList.map((p) => ({
                id: p.id,
                label: `${p.codigo ? `[${p.codigo}] ` : ''}${p.descricao}`,
                sublabel: p.codigo_barras || p.gtin || '',
              })),
            )
          }
        }

        // Fornecedores
        if (usaFiltro('pessoas_fornecedores') || usaFiltro('produto_fornecedores')) {
          const fList = await pb.collection('fornecedores').getFullList({
            filter: 'ativo = true',
            sort: 'nome_fantasia,razao_social',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesFornecedores(
              fList.map((f) => ({
                id: f.id,
                label: f.nome_fantasia || f.razao_social,
                sublabel: f.cnpj || '',
              })),
            )
          }
        }

        // Clientes
        if (usaFiltro('pessoas_clientes')) {
          const cList = await pb.collection('clientes').getFullList({
            sort: 'nome_razao_social,nome_fantasia',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesClientes(
              cList.map((c) => ({
                id: c.id,
                label: c.nome_razao_social || c.nome_fantasia || 'Cliente',
                sublabel: c.cpf_cnpj || `${c.cidade || ''}/${c.uf || ''}`,
              })),
            )
          }
        }

        // Vendedores e Operadores de Caixa (usuários ativos)
        if (usaFiltro('pessoas_vendedores') || usaFiltro('pessoas_operadores_caixa')) {
          const uList = await pb.collection('usuarios').getFullList({
            filter: 'ativo = true',
            sort: 'nome',
            requestKey: null,
          })
          if (ativo) {
            const itens = uList.map((u) => ({ id: u.id, label: u.nome, sublabel: u.email }))
            setOpcoesVendedores(itens)
            setOpcoesOperadoresCaixa(itens)
          }
        }

        // Formas de Pagamento
        if (usaFiltro('vendas_formas_pagamento')) {
          const fpList = await pb.collection('formas_pagamento').getFullList({
            filter: 'ativo = true',
            sort: 'descricao',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesFormasPagamento(
              fpList.map((fp) => ({ id: fp.id, label: fp.descricao, sublabel: fp.tipo })),
            )
          }
        }

        // Terminais do PDV
        if (usaFiltro('vendas_terminais_pdv')) {
          const tList = await pb.collection('pdv_terminais').getFullList({
            filter: 'ativo = true',
            sort: 'nome',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesTerminais(
              tList.map((t) => ({ id: t.id, label: t.nome, sublabel: `IP: ${t.ip || '-'}` })),
            )
          }
        }

        // Intermediadores
        if (usaFiltro('vendas_intermediadores')) {
          const iList = await pb.collection('intermediadores').getFullList({
            filter: 'ativo = true',
            sort: 'nome',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesIntermediadores(
              iList.map((i) => ({ id: i.id, label: i.nome, sublabel: i.cnpj })),
            )
          }
        }

        // Plano de Contas
        if (usaFiltro('financeiro_plano_contas')) {
          const pcList = await pb.collection('plano_contas').getFullList({
            filter: 'ativo = true',
            sort: 'codigo',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesPlanoContas(
              pcList.map((pc) => ({
                id: pc.id,
                label: `${pc.codigo} - ${pc.descricao}`,
                sublabel: `${pc.natureza} (${pc.tipo})`,
                contaPaiId: pc.conta_pai_id,
                natureza: pc.natureza,
              })),
            )
          }
        }

        // Centros de Custo
        if (usaFiltro('financeiro_centros_custo')) {
          const ccList = await pb.collection('centros_custo').getFullList({
            filter: 'ativo = true',
            sort: 'codigo,nome',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesCentrosCusto(
              ccList.map((cc) => ({
                id: cc.id,
                label: `${cc.codigo ? `[${cc.codigo}] ` : ''}${cc.nome}`,
              })),
            )
          }
        }

        // Contas Financeiras
        if (usaFiltro('financeiro_contas_financeiras')) {
          const cfList = await pb.collection('contas_financeiras').getFullList({
            filter: 'ativo = true',
            sort: 'nome',
            requestKey: null,
          })
          if (ativo) {
            setOpcoesContasFinanceiras(
              cfList.map((cf) => ({
                id: cf.id,
                label: cf.nome,
                sublabel: cf.tipo,
              })),
            )
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados dos filtros declarados:', err)
      }
    }

    carregarDadosFiltros()
    return () => {
      ativo = false
    }
  }, [usaFiltro])

  // Validação dos 366 dias
  const validacaoPeriodo = useMemo(() => {
    return validarPeriodoMaximo366Dias(
      filtros.periodo?.dataInicio || '',
      filtros.periodo?.dataFim || '',
    )
  }, [filtros.periodo?.dataInicio, filtros.periodo?.dataFim])

  // Ações de empresas
  const handleToggleEmpresa = useCallback(
    (empresaId: string) => {
      const listaAtual = filtros.empresas_ids || []
      const jaMarcada = listaAtual.includes(empresaId)
      let novaLista: string[]
      if (jaMarcada) {
        if (listaAtual.length === 1) return
        novaLista = listaAtual.filter((id) => id !== empresaId)
      } else {
        novaLista = [...listaAtual, empresaId]
      }
      onChange({ ...filtros, empresas_ids: novaLista })
    },
    [filtros, onChange],
  )

  const handleMarcarTodasEmpresas = useCallback(() => {
    const todosIds = empresas.map((e) => e.id)
    onChange({ ...filtros, empresas_ids: todosIds })
  }, [empresas, filtros, onChange])

  const handleDesmarcarTodasEmpresas = useCallback(() => {
    const padraoId = empresaAtiva?.id || empresas[0]?.id
    onChange({ ...filtros, empresas_ids: padraoId ? [padraoId] : [] })
  }, [empresaAtiva, empresas, filtros, onChange])

  // Ações de período
  const handleTrocarAtalho = useCallback(
    (atalho: TipoAtalhoPeriodo) => {
      if (atalho === 'personalizado') {
        onChange({ ...filtros, atalho_periodo: 'personalizado' })
        return
      }
      const novoPeriodo = calcularPeriodoPorAtalho(atalho)
      onChange({
        ...filtros,
        atalho_periodo: atalho,
        periodo: novoPeriodo,
      })
    },
    [filtros, onChange],
  )

  const handleMudarDataInicio = useCallback(
    (dataInicio: string) => {
      onChange({
        ...filtros,
        atalho_periodo: 'personalizado',
        periodo: {
          dataInicio,
          dataFim: filtros.periodo?.dataFim || dataInicio,
        },
      })
    },
    [filtros, onChange],
  )

  const handleMudarDataFim = useCallback(
    (dataFim: string) => {
      onChange({
        ...filtros,
        atalho_periodo: 'personalizado',
        periodo: {
          dataInicio: filtros.periodo?.dataInicio || dataFim,
          dataFim,
        },
      })
    },
    [filtros, onChange],
  )

  // REGRA DE NEGÓCIO: Grupos e Categorias
  // Marcar o grupo marca automaticamente as categorias dele
  const handleGruposChange = (novosGruposIds: string[]) => {
    const categoriasIdsAtuais = new Set(filtros.categorias_ids || [])
    const gruposAnteriores = new Set(filtros.grupos_ids || [])

    // Grupos que acabaram de ser marcados
    const adicionados = novosGruposIds.filter((gid) => !gruposAnteriores.has(gid))
    // Grupos que foram desmarcados
    const removidos = Array.from(gruposAnteriores).filter((gid) => !novosGruposIds.includes(gid))

    // Adiciona as categorias dos grupos marcados
    adicionados.forEach((gid) => {
      opcoesCategorias
        .filter((c) => c.grupoId === gid)
        .forEach((c) => categoriasIdsAtuais.add(c.id))
    })

    // Remove as categorias dos grupos desmarcados
    removidos.forEach((gid) => {
      opcoesCategorias
        .filter((c) => c.grupoId === gid)
        .forEach((c) => categoriasIdsAtuais.delete(c.id))
    })

    onChange({
      ...filtros,
      grupos_ids: novosGruposIds,
      categorias_ids: Array.from(categoriasIdsAtuais),
    })
  }

  // REGRA DE NEGÓCIO: Plano de Contas
  // Marcar a conta sintética marca as analíticas abaixo dela
  const handlePlanoContasChange = (novasContasIds: string[]) => {
    const contasSet = new Set(novasContasIds)
    const contasAnteriores = new Set(filtros.plano_contas_ids || [])

    // Contas que foram adicionadas
    const adicionadas = novasContasIds.filter((cid) => !contasAnteriores.has(cid))

    adicionadas.forEach((cid) => {
      const conta = opcoesPlanoContas.find((c) => c.id === cid)
      if (conta && conta.natureza === 'Sintética') {
        // Encontra filhas diretas ou filhas que apontam para ela
        opcoesPlanoContas.forEach((sub) => {
          if (sub.contaPaiId === cid) {
            contasSet.add(sub.id)
          }
        })
      }
    })

    onChange({
      ...filtros,
      plano_contas_ids: Array.from(contasSet),
    })
  }

  // Resumos e badges
  const empresasIds = filtros.empresas_ids || []
  const temMaisDeUmaEmpresa = empresas.length > 1
  const maisDeUmaEmpresaMarcada = empresasIds.length > 1

  const nomesEmpresasMarcadas = useMemo(() => {
    return empresasIds.map((id) => {
      const e = empresas.find((item) => item.id === id)
      return e ? `${e.codigo ? `[${e.codigo}] ` : ''}${e.nome_fantasia || e.razao_social}` : id
    })
  }, [empresasIds, empresas])

  const linhaLegivelFiltros = useMemo(() => {
    return formatarLinhaLegivelFiltros({
      filtros,
      nomesEmpresas: nomesEmpresasMarcadas,
    })
  }, [filtros, nomesEmpresasMarcadas])

  // Verificação se existe filtro de produto ativo em relatório de vendas/compras
  const temFiltroProdutoAtivo = useMemo(() => {
    return (
      (filtros.grupos_ids && filtros.grupos_ids.length > 0) ||
      (filtros.categorias_ids && filtros.categorias_ids.length > 0) ||
      (filtros.marcas_ids && filtros.marcas_ids.length > 0) ||
      (filtros.produtos_ids && filtros.produtos_ids.length > 0) ||
      (filtros.fornecedores_produto_ids && filtros.fornecedores_produto_ids.length > 0) ||
      (filtros.ncms && filtros.ncms.length > 0) ||
      filtros.so_fiscal_nao_revisado
    )
  }, [filtros])

  // Opções estáticas para selects múltiplos
  const opcoesTiposVenda: ItemOpcaoFiltro[] = [
    { id: 'PDV', label: 'PDV' },
    { id: 'Pedido', label: 'Pedido de Venda' },
    { id: 'Orçamento', label: 'Orçamento' },
  ]

  const opcoesStatusVenda: ItemOpcaoFiltro[] = [
    { id: 'Finalizada', label: 'Finalizada' },
    { id: 'Pedido em aberto', label: 'Pedido em aberto' },
    { id: 'Orçamento', label: 'Orçamento' },
    { id: 'Orçamento expirado', label: 'Orçamento expirado' },
    { id: 'Pendente de nota', label: 'Pendente de nota' },
  ]

  const opcoesModelosFiscais: ItemOpcaoFiltro[] = [
    { id: '55', label: 'NF-e (Modelo 55)' },
    { id: '65', label: 'NFC-e (Modelo 65)' },
  ]

  const opcoesSituacoesNota: ItemOpcaoFiltro[] = [
    { id: 'Autorizada', label: 'Autorizada' },
    { id: 'Processando', label: 'Processando' },
    { id: 'Rejeitada', label: 'Rejeitada' },
    { id: 'Cancelada', label: 'Cancelada' },
    { id: 'Denegada', label: 'Denegada' },
  ]

  const opcoesSituacoesTitulo: ItemOpcaoFiltro[] = [
    { id: 'Em aberto', label: 'Em aberto' },
    { id: 'Pago', label: 'Pago / Recebido' },
    { id: 'Pago parcial', label: 'Parcial' },
    { id: 'Cancelado', label: 'Cancelado' },
  ]

  const opcoesOrigensTitulo: ItemOpcaoFiltro[] = [
    { id: 'Manual', label: 'Manual' },
    { id: 'Venda', label: 'Venda' },
    { id: 'PDV', label: 'PDV' },
    { id: 'NF Entrada', label: 'NF de Entrada' },
    { id: 'Recorrência', label: 'Recorrência' },
  ]

  const opcoesUfsBrasil: ItemOpcaoFiltro[] = [
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
  ].map((uf) => ({ id: uf, label: uf }))

  const opcoesSituacaoProduto: ItemOpcaoFiltro[] = [
    { id: 'ativo', label: 'Ativos' },
    { id: 'inativo', label: 'Inativos' },
  ]

  // Contagem de filtros extras que estão ativos
  const totalFiltrosExtrasAtivos = useMemo(() => {
    let count = 0
    if (filtros.grupos_ids?.length) count++
    if (filtros.categorias_ids?.length) count++
    if (filtros.marcas_ids?.length) count++
    if (filtros.produtos_ids?.length) count++
    if (filtros.fornecedores_produto_ids?.length) count++
    if (filtros.ncms?.length) count++
    if (filtros.situacao_produto?.length) count++
    if (filtros.so_fiscal_nao_revisado) count++
    if (filtros.clientes_ids?.length) count++
    if (filtros.fornecedores_ids?.length) count++
    if (filtros.vendedores_ids?.length) count++
    if (filtros.operadores_caixa_ids?.length) count++
    if (filtros.cliente_ufs?.length) count++
    if (filtros.vendas_tipos?.length) count++
    if (filtros.vendas_status?.length) count++
    if (filtros.formas_pagamento_ids?.length) count++
    if (filtros.terminais_pdv_ids?.length) count++
    if (filtros.intermediadores_ids?.length) count++
    if (filtros.vendas_nota_fiscal && filtros.vendas_nota_fiscal !== 'todas') count++
    if (filtros.fiscal_modelos?.length) count++
    if (filtros.fiscal_cfops?.length) count++
    if (filtros.fiscal_csts_csosns?.length) count++
    if (filtros.fiscal_situacoes_nota?.length) count++
    if (filtros.fiscal_ufs_destino?.length) count++
    if (filtros.plano_contas_ids?.length) count++
    if (filtros.centros_custo_ids?.length) count++
    if (filtros.contas_financeiras_ids?.length) count++
    if (filtros.situacoes_titulo?.length) count++
    if (filtros.origens_titulo?.length) count++
    if (filtros.tipo_data && filtros.tipo_data !== 'emissao' && filtros.tipo_data !== 'entrada')
      count++
    return count
  }, [filtros])

  const temAlgumFiltroCatalogoDeclarado = useMemo(() => {
    if (!filtrosDeclarados) return false
    return filtrosDeclarados.length > 0
  }, [filtrosDeclarados])

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
                <span className="font-semibold">Filtros aplicados: </span>
                {linhaLegivelFiltros}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-semibold text-slate-700">ERP Comercial</p>
            <p>Emissão: {dataHoraEmissao}</p>
          </div>
        </div>

        {/* Faixa destacada quando inclui notas de teste */}
        {suportaNotasTeste && filtros.incluir_notas_teste && (
          <div className="mt-2 py-1 px-2.5 bg-amber-100 border border-amber-300 text-amber-900 font-bold text-center text-xs uppercase tracking-wider rounded">
            ⚠ INCLUI NOTAS DE TESTE (HOMOLOGAÇÃO)
          </div>
        )}

        {/* Aviso de filtro de produto em relatório */}
        {temFiltroProdutoAtivo && (
          <div className="mt-1.5 py-1 px-2.5 bg-blue-50 border border-blue-200 text-blue-900 font-semibold text-center text-[11px] rounded">
            Filtro de produto aplicado: os totais do relatório correspondem apenas aos itens
            filtrados.
          </div>
        )}
      </div>

      {/* ========================================================
          FAIXA NA TELA: INCLUI NOTAS DE TESTE
          ======================================================== */}
      {suportaNotasTeste && filtros.incluir_notas_teste && (
        <div className="print:hidden bg-amber-500 text-slate-950 font-extrabold text-xs uppercase tracking-widest text-center py-1.5 px-4 rounded-md shadow-xs animate-pulse">
          INCLUI NOTAS DE TESTE (HOMOLOGAÇÃO)
        </div>
      )}

      {/* ========================================================
          AVISO NA TELA: FILTRO DE PRODUTO ATIVO
          ======================================================== */}
      {temFiltroProdutoAtivo && (
        <div className="print:hidden bg-blue-50 border border-blue-200 text-blue-950 font-medium text-xs py-1.5 px-3 rounded-md flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              Filtro de produto ativo: os itens foram filtrados e os totais correspondem apenas aos
              itens filtrados.
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white text-blue-700 border-blue-200">
            Itens Filtrados
          </Badge>
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
                    Empresas ({empresasIds.length} de {empresas.length} selecionadas)
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[11px] bg-white font-normal text-slate-700"
                  >
                    {nomesEmpresasMarcadas.join(', ') || 'Nenhuma selecionada'}
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

              {/* Lista expansível de empresas com checkboxes */}
              {empresasAbertas && (
                <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {empresas.map((emp) => {
                    const marcada = empresasIds.includes(emp.id)
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
                      checked={filtros.ver_so_total}
                      onCheckedChange={(checked) =>
                        onChange({
                          ...filtros,
                          ver_so_total: Boolean(checked),
                        })
                      }
                    />
                    <span>
                      Ver só o total consolidado (oculta colunas e quadros individuais por empresa)
                    </span>
                  </label>
                  {!filtros.ver_so_total && (
                    <span className="text-[11px] text-slate-500 italic">
                      Mostrando cada empresa separada + total consolidado
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Linha 2: Período com Atalhos e Datas Personalizadas */}
          {!ocultarPeriodo && (
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
                  const ativo = filtros.atalho_periodo === atalho.id
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

              {/* Inputs de Data Inicial, Data Final e Tipo de Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-slate-600">Data Inicial</Label>
                  <Input
                    type="date"
                    value={filtros.periodo?.dataInicio || ''}
                    onChange={(e) => handleMudarDataInicio(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-slate-600">Data Final</Label>
                  <Input
                    type="date"
                    value={filtros.periodo?.dataFim || ''}
                    onChange={(e) => handleMudarDataFim(e.target.value)}
                    className="h-8 text-xs bg-white"
                  />
                </div>

                {/* Escolha do tipo de data quando o relatório suportar (ex: emissão, vencimento, pagamento ou competência) */}
                {usaFiltro('datas_tipo_data') && (
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-slate-600">
                      Filtrar data por
                    </Label>
                    <Select
                      value={filtros.tipo_data || 'emissao'}
                      onValueChange={(val: OpcaoTipoData) =>
                        onChange({ ...filtros, tipo_data: val })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                        <SelectValue placeholder="Data de..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="emissao">Data de Emissão</SelectItem>
                        <SelectItem value="entrada">Data de Entrada da Nota</SelectItem>
                        <SelectItem value="vencimento">Data de Vencimento</SelectItem>
                        <SelectItem value="pagamento">Data de Pagamento / Liquidação</SelectItem>
                        <SelectItem value="competencia">Data de Competência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Opção notas fiscais de homologação / teste */}
                {suportaNotasTeste && (
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <Checkbox
                        checked={Boolean(filtros.incluir_notas_teste)}
                        onCheckedChange={(checked) =>
                          onChange({
                            ...filtros,
                            incluir_notas_teste: Boolean(checked),
                          })
                        }
                      />
                      <span>Incluir notas de teste (homologação)</span>
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
          )}

          {/* ========================================================
              CATÁLOGO DE FILTROS ESPECÍFICOS DECLARADOS (Prompt 8.0b)
              ======================================================== */}
          {(temAlgumFiltroCatalogoDeclarado || children || filtrosExtras) && (
            <div className="border-t border-slate-200 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setExtrasAbertos(!extrasAbertos)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                  <span>Filtros específicos do relatório</span>
                  {totalFiltrosExtrasAtivos > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 px-1.5 text-[10px] bg-blue-100 text-blue-800 font-bold"
                    >
                      {totalFiltrosExtrasAtivos} ativo(s)
                    </Badge>
                  )}
                  {extrasAbertos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {totalFiltrosExtrasAtivos > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onChange({
                        empresas_ids: filtros.empresas_ids,
                        ver_so_total: filtros.ver_so_total,
                        periodo: filtros.periodo,
                        atalho_periodo: filtros.atalho_periodo,
                        incluir_notas_teste: filtros.incluir_notas_teste,
                      })
                    }}
                    className="h-6 text-[11px] text-slate-500 hover:text-rose-600 px-2"
                  >
                    Limpar filtros adicionais
                  </Button>
                )}
              </div>

              {extrasAbertos && (
                <div className="pt-1 space-y-4">
                  {/* Grade de Filtros de Produto */}
                  {(usaFiltro('produto_grupos_categorias') ||
                    usaFiltro('produtos_grupos') ||
                    usaFiltro('produto_marcas') ||
                    usaFiltro('produto_produtos') ||
                    usaFiltro('produtos_especificos') ||
                    usaFiltro('produto_fornecedores') ||
                    usaFiltro('produto_ncms') ||
                    usaFiltro('produto_situacao') ||
                    usaFiltro('produto_so_fiscal_nao_revisado')) && (
                    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/40 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Package className="h-3.5 w-3.5 text-blue-600" />
                        <span>Filtros de Produtos</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {(usaFiltro('produto_grupos_categorias') ||
                          usaFiltro('produtos_grupos')) && (
                          <>
                            <MultiSelectFiltro
                              label={
                                usaFiltro('produto_grupos_categorias')
                                  ? 'Grupos (marcar o grupo marca as categorias)'
                                  : 'Grupo de Produtos'
                              }
                              opcoes={opcoesGrupos}
                              valoresSelecionados={filtros.grupos_ids || []}
                              onChange={handleGruposChange}
                              buscaPlaceholder="Buscar grupo..."
                            />
                            {usaFiltro('produto_grupos_categorias') && (
                              <MultiSelectFiltro
                                label="Categorias"
                                opcoes={opcoesCategorias}
                                valoresSelecionados={filtros.categorias_ids || []}
                                onChange={(cats) => onChange({ ...filtros, categorias_ids: cats })}
                                buscaPlaceholder="Buscar categoria..."
                              />
                            )}
                          </>
                        )}
                        {usaFiltro('produto_marcas') && (
                          <MultiSelectFiltro
                            label="Marcas"
                            opcoes={opcoesMarcas}
                            valoresSelecionados={filtros.marcas_ids || []}
                            onChange={(m) => onChange({ ...filtros, marcas_ids: m })}
                            buscaPlaceholder="Buscar marca..."
                          />
                        )}
                        {(usaFiltro('produto_produtos') || usaFiltro('produtos_especificos')) && (
                          <MultiSelectFiltro
                            label="Produto (código, descrição, barras)"
                            opcoes={opcoesProdutos}
                            valoresSelecionados={filtros.produtos_ids || []}
                            onChange={(p) => onChange({ ...filtros, produtos_ids: p })}
                            buscaPlaceholder="Código, descrição ou barras..."
                          />
                        )}
                        {usaFiltro('produto_fornecedores') && (
                          <MultiSelectFiltro
                            label="Fornecedor do Produto"
                            opcoes={opcoesFornecedores}
                            valoresSelecionados={filtros.fornecedores_produto_ids || []}
                            onChange={(f) => onChange({ ...filtros, fornecedores_produto_ids: f })}
                            buscaPlaceholder="Buscar fornecedor..."
                          />
                        )}
                        {usaFiltro('produto_situacao') && (
                          <MultiSelectFiltro
                            label="Situação do Produto"
                            opcoes={opcoesSituacaoProduto}
                            valoresSelecionados={filtros.situacao_produto || []}
                            onChange={(s) =>
                              onChange({
                                ...filtros,
                                situacao_produto: s as ('ativo' | 'inativo')[],
                              })
                            }
                          />
                        )}
                      </div>

                      {/* Flag só fiscal não revisado */}
                      {usaFiltro('produto_so_fiscal_nao_revisado') && (
                        <div className="pt-1">
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                            <Checkbox
                              checked={Boolean(filtros.so_fiscal_nao_revisado)}
                              onCheckedChange={(c) =>
                                onChange({
                                  ...filtros,
                                  so_fiscal_nao_revisado: Boolean(c),
                                })
                              }
                            />
                            <span>Exibir apenas produtos com fiscal não revisado</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Grade de Filtros de Pessoas */}
                  {(usaFiltro('pessoas_clientes') ||
                    usaFiltro('pessoas_fornecedores') ||
                    usaFiltro('pessoas_vendedores') ||
                    usaFiltro('pessoas_operadores_caixa') ||
                    usaFiltro('pessoas_cliente_ufs')) && (
                    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/40 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Users className="h-3.5 w-3.5 text-blue-600" />
                        <span>Filtros de Pessoas</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {usaFiltro('pessoas_clientes') && (
                          <MultiSelectFiltro
                            label="Cliente"
                            opcoes={opcoesClientes}
                            valoresSelecionados={filtros.clientes_ids || []}
                            onChange={(c) => onChange({ ...filtros, clientes_ids: c })}
                            buscaPlaceholder="Nome, CPF ou CNPJ..."
                          />
                        )}
                        {usaFiltro('pessoas_fornecedores') && (
                          <MultiSelectFiltro
                            label="Fornecedor"
                            opcoes={opcoesFornecedores}
                            valoresSelecionados={filtros.fornecedores_ids || []}
                            onChange={(f) => onChange({ ...filtros, fornecedores_ids: f })}
                            buscaPlaceholder="Razão social ou CNPJ..."
                          />
                        )}
                        {usaFiltro('pessoas_vendedores') && (
                          <MultiSelectFiltro
                            label="Vendedor"
                            opcoes={opcoesVendedores}
                            valoresSelecionados={filtros.vendedores_ids || []}
                            onChange={(v) => onChange({ ...filtros, vendedores_ids: v })}
                            buscaPlaceholder="Nome do vendedor..."
                          />
                        )}
                        {usaFiltro('pessoas_operadores_caixa') && (
                          <MultiSelectFiltro
                            label="Operador de Caixa"
                            opcoes={opcoesOperadoresCaixa}
                            valoresSelecionados={filtros.operadores_caixa_ids || []}
                            onChange={(op) => onChange({ ...filtros, operadores_caixa_ids: op })}
                            buscaPlaceholder="Nome do operador..."
                          />
                        )}
                        {usaFiltro('pessoas_cliente_ufs') && (
                          <MultiSelectFiltro
                            label="UF do Cliente"
                            opcoes={opcoesUfsBrasil}
                            valoresSelecionados={filtros.cliente_ufs || []}
                            onChange={(ufs) => onChange({ ...filtros, cliente_ufs: ufs })}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Grade de Filtros de Vendas */}
                  {(usaFiltro('vendas_tipos') ||
                    usaFiltro('vendas_status') ||
                    usaFiltro('vendas_formas_pagamento') ||
                    usaFiltro('vendas_terminais_pdv') ||
                    usaFiltro('vendas_intermediadores') ||
                    usaFiltro('vendas_com_sem_nota')) && (
                    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/40 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
                        <span>Filtros de Vendas</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {usaFiltro('vendas_tipos') && (
                          <MultiSelectFiltro
                            label="Tipo de Venda"
                            opcoes={opcoesTiposVenda}
                            valoresSelecionados={filtros.vendas_tipos || []}
                            onChange={(vt) =>
                              onChange({
                                ...filtros,
                                vendas_tipos: vt as ('PDV' | 'Pedido' | 'Orçamento')[],
                              })
                            }
                          />
                        )}
                        {usaFiltro('vendas_status') && (
                          <MultiSelectFiltro
                            label="Status da Venda"
                            opcoes={opcoesStatusVenda}
                            valoresSelecionados={filtros.vendas_status || []}
                            onChange={(vs) => onChange({ ...filtros, vendas_status: vs })}
                          />
                        )}
                        {usaFiltro('vendas_formas_pagamento') && (
                          <MultiSelectFiltro
                            label="Forma de Pagamento"
                            opcoes={opcoesFormasPagamento}
                            valoresSelecionados={filtros.formas_pagamento_ids || []}
                            onChange={(fp) => onChange({ ...filtros, formas_pagamento_ids: fp })}
                            buscaPlaceholder="Buscar forma de pagamento..."
                          />
                        )}
                        {usaFiltro('vendas_terminais_pdv') && (
                          <MultiSelectFiltro
                            label="Terminal do PDV"
                            opcoes={opcoesTerminais}
                            valoresSelecionados={filtros.terminais_pdv_ids || []}
                            onChange={(tp) => onChange({ ...filtros, terminais_pdv_ids: tp })}
                            buscaPlaceholder="Buscar terminal..."
                          />
                        )}
                        {usaFiltro('vendas_intermediadores') && (
                          <MultiSelectFiltro
                            label="Intermediador / Marketplace"
                            opcoes={opcoesIntermediadores}
                            valoresSelecionados={filtros.intermediadores_ids || []}
                            onChange={(intm) => onChange({ ...filtros, intermediadores_ids: intm })}
                            buscaPlaceholder="Mercado Livre, Shopee..."
                          />
                        )}
                        {usaFiltro('vendas_com_sem_nota') && (
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Documento Fiscal
                            </label>
                            <Select
                              value={filtros.vendas_nota_fiscal || 'todas'}
                              onValueChange={(val: 'todas' | 'com_nota' | 'sem_nota') =>
                                onChange({ ...filtros, vendas_nota_fiscal: val })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                                <SelectValue placeholder="Com ou sem nota..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todas">Todas as vendas</SelectItem>
                                <SelectItem value="com_nota">Apenas com nota fiscal</SelectItem>
                                <SelectItem value="sem_nota">Apenas sem nota fiscal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Grade de Filtros Fiscais */}
                  {(usaFiltro('fiscal_modelos') ||
                    usaFiltro('fiscal_cfops') ||
                    usaFiltro('fiscal_csts_csosns') ||
                    usaFiltro('fiscal_situacoes_nota') ||
                    usaFiltro('fiscal_ufs_destino')) && (
                    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/40 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
                        <span>Filtros Fiscais</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {usaFiltro('fiscal_modelos') && (
                          <MultiSelectFiltro
                            label="Modelo do Documento"
                            opcoes={opcoesModelosFiscais}
                            valoresSelecionados={filtros.fiscal_modelos || []}
                            onChange={(mod) =>
                              onChange({ ...filtros, fiscal_modelos: mod as ('55' | '65')[] })
                            }
                          />
                        )}
                        {usaFiltro('fiscal_situacoes_nota') && (
                          <MultiSelectFiltro
                            label="Situação da Nota"
                            opcoes={opcoesSituacoesNota}
                            valoresSelecionados={filtros.fiscal_situacoes_nota || []}
                            onChange={(sit) => onChange({ ...filtros, fiscal_situacoes_nota: sit })}
                          />
                        )}
                        {usaFiltro('fiscal_ufs_destino') && (
                          <MultiSelectFiltro
                            label="UF de Destino"
                            opcoes={opcoesUfsBrasil}
                            valoresSelecionados={filtros.fiscal_ufs_destino || []}
                            onChange={(ufs) => onChange({ ...filtros, fiscal_ufs_destino: ufs })}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Grade de Filtros Financeiros */}
                  {(usaFiltro('financeiro_plano_contas') ||
                    usaFiltro('financeiro_centros_custo') ||
                    usaFiltro('financeiro_contas_financeiras') ||
                    usaFiltro('financeiro_situacoes_titulo') ||
                    usaFiltro('financeiro_origens_titulo')) && (
                    <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/40 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <DollarSign className="h-3.5 w-3.5 text-blue-600" />
                        <span>Filtros Financeiros</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {usaFiltro('financeiro_plano_contas') && (
                          <MultiSelectFiltro
                            label="Plano de Contas (marcar sintética marca analíticas)"
                            opcoes={opcoesPlanoContas}
                            valoresSelecionados={filtros.plano_contas_ids || []}
                            onChange={handlePlanoContasChange}
                            buscaPlaceholder="Código ou descrição..."
                          />
                        )}
                        {usaFiltro('financeiro_centros_custo') && (
                          <MultiSelectFiltro
                            label="Centro de Custo"
                            opcoes={opcoesCentrosCusto}
                            valoresSelecionados={filtros.centros_custo_ids || []}
                            onChange={(cc) => onChange({ ...filtros, centros_custo_ids: cc })}
                            buscaPlaceholder="Buscar centro de custo..."
                          />
                        )}
                        {usaFiltro('financeiro_contas_financeiras') && (
                          <MultiSelectFiltro
                            label="Conta Financeira / Caixa"
                            opcoes={opcoesContasFinanceiras}
                            valoresSelecionados={filtros.contas_financeiras_ids || []}
                            onChange={(cf) => onChange({ ...filtros, contas_financeiras_ids: cf })}
                            buscaPlaceholder="Buscar conta bancária..."
                          />
                        )}
                        {usaFiltro('financeiro_situacoes_titulo') && (
                          <MultiSelectFiltro
                            label="Situação do Título"
                            opcoes={opcoesSituacoesTitulo}
                            valoresSelecionados={filtros.situacoes_titulo || []}
                            onChange={(st) => onChange({ ...filtros, situacoes_titulo: st })}
                          />
                        )}
                        {usaFiltro('financeiro_origens_titulo') && (
                          <MultiSelectFiltro
                            label="Origem do Título"
                            opcoes={opcoesOrigensTitulo}
                            valoresSelecionados={filtros.origens_titulo || []}
                            onChange={(ot) => onChange({ ...filtros, origens_titulo: ot })}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Slot para conteúdo extra customizado */}
                  {children}
                  {filtrosExtras}
                </div>
              )}
            </div>
          )}

          {/* Linha 3: Barra de Ações: Filtrar, Filtros Salvos, Exportar CSV e Imprimir */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              {onFiltrar && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onFiltrar}
                  disabled={carregando || !validacaoPeriodo.valido || desabilitado}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  {carregando ? 'Carregando...' : 'Atualizar consulta'}
                </Button>
              )}

              {/* Botões "Salvar estes filtros" e "Meus filtros" (Prompt 8.0b item 4) */}
              {relatorioId && (
                <GerenciadorFiltrosSalvos
                  relatorioId={relatorioId}
                  filtrosAtuais={filtros}
                  onAplicarFiltros={(fNovos) => onChange({ ...filtros, ...fNovos })}
                  disabled={carregando || desabilitado}
                />
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
                onClick={() => {
                  if (onImprimir) {
                    onImprimir()
                  } else {
                    window.print()
                  }
                }}
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

export default FiltrosRelatorio
