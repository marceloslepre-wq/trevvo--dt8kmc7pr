import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Layers,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Upload,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  FileSpreadsheet,
  Clock,
  User,
  ArrowRight,
  RefreshCw,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  movimentarEstoque,
  ItemMovimentacaoEstoque,
  OrigemMovimentoEstoque,
  TipoMovimentoEstoque,
  EstoqueMovimento,
  obterSaldoAtual,
} from '@/services/estoque'
import { Produto } from '@/services/produtos'
import { BuscaProdutoGtin } from '@/components/BuscaProdutoGtin'
import { ImportarSaldoInicialModal } from '@/components/ImportarSaldoInicialModal'
import { listarLotesDisponiveisProduto, Lote } from '@/services/lotes'
import pb from '@/lib/pocketbase/client'

// Tipos de lançamentos da tela conforme solicitado:
// Saldo inicial, Ajuste de entrada, Ajuste de saída, Perda/avaria, Consumo interno, Bonificação recebida, Bonificação enviada
export type TipoLancamentoForm =
  | 'Saldo inicial'
  | 'Ajuste de entrada'
  | 'Ajuste de saída'
  | 'Perda/avaria'
  | 'Consumo interno'
  | 'Bonificação recebida'
  | 'Bonificação enviada'

interface ConfigTipoLancamento {
  tipo: TipoMovimentoEstoque
  origem: OrigemMovimentoEstoque
  custoObrigatorio: boolean
  custoOculto: boolean
  motivoObrigatorio: boolean
  permiteDataPassada: boolean
}

const CONFIG_TIPOS: Record<TipoLancamentoForm, ConfigTipoLancamento> = {
  'Saldo inicial': {
    tipo: 'Entrada',
    origem: 'SALDO_INICIAL',
    custoObrigatorio: true,
    custoOculto: false,
    motivoObrigatorio: false,
    permiteDataPassada: true,
  },
  'Ajuste de entrada': {
    tipo: 'Entrada',
    origem: 'AJUSTE_ENTRADA',
    custoObrigatorio: false, // se vazio, usa custo médio atual
    custoOculto: false,
    motivoObrigatorio: true,
    permiteDataPassada: false,
  },
  'Ajuste de saída': {
    tipo: 'Saída',
    origem: 'AJUSTE_SAIDA',
    custoObrigatorio: false,
    custoOculto: true,
    motivoObrigatorio: true,
    permiteDataPassada: false,
  },
  'Perda/avaria': {
    tipo: 'Saída',
    origem: 'PERDA',
    custoObrigatorio: false,
    custoOculto: true,
    motivoObrigatorio: true,
    permiteDataPassada: false,
  },
  'Consumo interno': {
    tipo: 'Saída',
    origem: 'CONSUMO_INTERNO',
    custoObrigatorio: false,
    custoOculto: true,
    motivoObrigatorio: true,
    permiteDataPassada: false,
  },
  'Bonificação recebida': {
    tipo: 'Entrada',
    origem: 'BONIFICACAO_ENTRADA',
    custoObrigatorio: true,
    custoOculto: false,
    motivoObrigatorio: false,
    permiteDataPassada: false,
  },
  'Bonificação enviada': {
    tipo: 'Saída',
    origem: 'BONIFICACAO_SAIDA',
    custoObrigatorio: false,
    custoOculto: true,
    motivoObrigatorio: false,
    permiteDataPassada: false,
  },
}

export interface ItemGradeLancamento {
  idTemp: string
  produto: Produto
  quantidade: number
  custoUnitario?: number
  saldoAtual: number
  custoMedioAtual: number
  // Campos de controle de lote
  numeroLote?: string
  dataFabricacao?: string
  dataValidade?: string
  loteId?: string // para saídas com lote selecionado
}

export const LancamentosEstoquePage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, administrador } = usePermissoes()
  const podeCriar = administrador || pode('estoque', 'criar')

  // Aba ativa: 'novo' (formulário) ou 'historico' (listagem de lançamentos)
  const [abaAtiva, setAbaAtiva] = useState<'novo' | 'historico'>('novo')

  // Estado do Formulário
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamentoForm>('Ajuste de entrada')
  const [dataMovimento, setDataMovimento] = useState<string>(new Date().toISOString().slice(0, 16))
  const [motivo, setMotivo] = useState('')
  const [observacao, setObservacao] = useState('')
  const [gradeItens, setGradeItens] = useState<ItemGradeLancamento[]>([])
  const [salvando, setSalvando] = useState(false)

  // Modal de importação CSV de saldo inicial
  const [modalImportarCsvAberto, setModalImportarCsvAberto] = useState(false)

  // Modal de resumo após salvar
  const [modalResumoAberto, setModalResumoAberto] = useState(false)
  const [resumoGravado, setResumoGravado] = useState<{
    totalItens: number
    movimentos: Array<{
      produto: string
      quantidade: number
      saldoPosterior: number
      custoMedioPosterior: number
    }>
  } | null>(null)

  // Estado do Histórico de Lançamentos
  const [historicoMovimentos, setHistoricoMovimentos] = useState<EstoqueMovimento[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)
  const [filtroHistoricoOrigem, setFiltroHistoricoOrigem] = useState<string>('todos')
  const [filtroHistoricoInicio, setFiltroHistoricoInicio] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  )
  const [filtroHistoricoFim, setFiltroHistoricoFim] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [filtroHistoricoUsuario, setFiltroHistoricoUsuario] = useState<string>('todos')
  const [usuariosDoSistema, setUsuariosDoSistema] = useState<Array<{ id: string; nome: string }>>(
    [],
  )

  const configAtual = CONFIG_TIPOS[tipoLancamento]

  // Cache de lotes disponíveis por produto para saídas
  const [lotesPorProduto, setLotesPorProduto] = useState<Record<string, Lote[]>>({})

  // Carrega lista de usuários para filtro de histórico
  useEffect(() => {
    pb.collection('usuarios')
      .getFullList<{ id: string; auth_user_id: string; nome: string }>({ sort: 'nome' })
      .then((users) => {
        setUsuariosDoSistema(users.map((u) => ({ id: u.auth_user_id, nome: u.nome })))
      })
      .catch(console.error)
  }, [])

  // Carregar lotes disponíveis quando um produto que controla lote é adicionado na grade
  const carregarLotesDoProduto = useCallback(
    async (prodId: string) => {
      if (!empresaAtiva || lotesPorProduto[prodId]) return
      const lots = await listarLotesDisponiveisProduto(empresaAtiva.id, prodId)
      setLotesPorProduto((prev) => ({ ...prev, [prodId]: lots }))
    },
    [empresaAtiva, lotesPorProduto],
  )

  // Adicionar produto na grade via seletor ou código de barras
  const handleAdicionarProduto = async (prod: Produto, quantidadeInicial = 1) => {
    if (!empresaAtiva) return

    // Buscar saldo atual e custo médio daquele produto na empresa ativa
    const saldoRec = await obterSaldoAtual(empresaAtiva.id, prod.id)
    const saldoAtual = saldoRec ? saldoRec.quantidade : 0
    const custoMedioAtual = saldoRec ? saldoRec.custo_medio : prod.preco_custo || 0

    // Se o produto controla lote e for saída, carrega lotes disponíveis
    if (prod.controla_lote_validade && configAtual.tipo === 'Saída') {
      carregarLotesDoProduto(prod.id)
    }

    setGradeItens((antiga) => {
      // Verifica se o item já está na grade
      const indiceExistente = antiga.findIndex((item) => item.produto.id === prod.id)
      if (indiceExistente >= 0) {
        // Incrementa a quantidade se já estiver na grade (comportamento de código de barras bipado)
        const copia = [...antiga]
        const atual = copia[indiceExistente]
        copia[indiceExistente] = {
          ...atual,
          quantidade: atual.quantidade + quantidadeInicial,
        }
        return copia
      }

      // Adiciona nova linha
      const novoItem: ItemGradeLancamento = {
        idTemp: `${prod.id}_${Date.now()}`,
        produto: prod,
        quantidade: quantidadeInicial,
        custoUnitario: configAtual.custoOculto ? undefined : custoMedioAtual || undefined,
        saldoAtual,
        custoMedioAtual,
        numeroLote: '',
        dataFabricacao: '',
        dataValidade: '',
        loteId: '',
      }
      return [...antiga, novoItem]
    })
  }

  const handleRemoverItemGrade = (idTemp: string) => {
    setGradeItens((ant) => ant.filter((i) => i.idTemp !== idTemp))
  }

  const handleAtualizarQuantidade = (idTemp: string, qtd: number) => {
    setGradeItens((ant) =>
      ant.map((item) => {
        if (item.idTemp !== idTemp) return item
        return { ...item, quantidade: qtd }
      }),
    )
  }

  const handleAtualizarCusto = (idTemp: string, custo: number) => {
    setGradeItens((ant) =>
      ant.map((item) => {
        if (item.idTemp !== idTemp) return item
        return { ...item, custoUnitario: custo }
      }),
    )
  }

  const handleAtualizarCampoItem = (
    idTemp: string,
    campo: keyof ItemGradeLancamento,
    valor: string,
  ) => {
    setGradeItens((ant) =>
      ant.map((item) => {
        if (item.idTemp !== idTemp) return item
        return { ...item, [campo]: valor }
      }),
    )
  }

  // Validação e Gravação
  const handleSalvarLancamento = async () => {
    if (!empresaAtiva) {
      toast({
        title: 'Selecione uma empresa ativa',
        variant: 'destructive',
      })
      return
    }

    if (!podeCriar) {
      toast({
        title: 'Permissão insuficiente',
        description: 'Seu perfil de usuário não tem permissão para criar lançamentos no estoque.',
        variant: 'destructive',
      })
      return
    }

    if (gradeItens.length === 0) {
      toast({
        title: 'Nenhum item na grade',
        description: 'Adicione pelo menos um produto para efetuar o lançamento.',
        variant: 'destructive',
      })
      return
    }

    if (configAtual.motivoObrigatorio && !motivo.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: `O tipo de lançamento "${tipoLancamento}" exige justificativa de motivo.`,
        variant: 'destructive',
      })
      return
    }

    // Validar quantidades e custos por linha
    for (let i = 0; i < gradeItens.length; i++) {
      const item = gradeItens[i]
      if (item.quantidade <= 0 || isNaN(item.quantidade)) {
        toast({
          title: 'Quantidade inválida',
          description: `O produto "${item.produto.descricao}" deve ter quantidade maior que zero.`,
          variant: 'destructive',
        })
        return
      }

      if (configAtual.custoObrigatorio) {
        if (
          item.custoUnitario === undefined ||
          item.custoUnitario === null ||
          isNaN(item.custoUnitario) ||
          item.custoUnitario < 0
        ) {
          toast({
            title: 'Custo unitário obrigatório',
            description: `Informe o custo unitário do produto "${item.produto.descricao}".`,
            variant: 'destructive',
          })
          return
        }
      }

      // Validação de controle de lote/validade para produtos com controla_lote_validade = true
      if (item.produto.controla_lote_validade) {
        if (configAtual.tipo === 'Entrada') {
          if (!item.numeroLote?.trim()) {
            toast({
              title: 'Número do lote obrigatório',
              description: `O produto "${item.produto.descricao}" exige número do lote na entrada.`,
              variant: 'destructive',
            })
            return
          }
          if (!item.dataValidade) {
            toast({
              title: 'Data de validade obrigatória',
              description: `O produto "${item.produto.descricao}" exige data de validade na entrada.`,
              variant: 'destructive',
            })
            return
          }
        } else {
          // Saída: se selecionou um lote específico, valida que a quantidade não excede o saldo do lote
          if (item.loteId) {
            const lots = lotesPorProduto[item.produto.id] || []
            const loteSel = lots.find((l) => l.id === item.loteId)
            if (loteSel && item.quantidade > loteSel.quantidade) {
              toast({
                title: 'Quantidade excede o saldo do lote',
                description: `Produto "${item.produto.descricao}": lote ${loteSel.numero_lote} possui apenas ${loteSel.quantidade.toFixed(
                  4,
                )} em saldo.`,
                variant: 'destructive',
              })
              return
            }
          }
        }
      }

      // Se for saída e a empresa não permite negativo, validação prévia na tela
      if (configAtual.tipo === 'Saída' && !empresaAtiva.permite_estoque_negativo) {
        const saldoApos = item.saldoAtual - item.quantidade
        if (saldoApos < 0) {
          toast({
            title: 'Saldo insuficiente',
            description: `Produto "${item.produto.descricao}": saldo atual ${item.saldoAtual.toFixed(
              4,
            )}, solicitado ${item.quantidade.toFixed(4)}. A empresa não permite estoque negativo.`,
            variant: 'destructive',
          })
          return
        }
      }
    }

    setSalvando(true)
    try {
      const dataMovIso = dataMovimento
        ? new Date(dataMovimento).toISOString()
        : new Date().toISOString()
      const docNumeroUnico = `AJUSTE_${Date.now().toString().slice(-6)}`

      const itensPayload: ItemMovimentacaoEstoque[] = gradeItens.map((item) => ({
        empresa_id: empresaAtiva.id,
        produto_id: item.produto.id,
        tipo: configAtual.tipo,
        origem: configAtual.origem,
        quantidade: item.quantidade,
        custo_unitario: item.custoUnitario,
        data_movimento: dataMovIso,
        documento_tipo: tipoLancamento === 'Saldo inicial' ? 'Saldo inicial' : 'Ajuste',
        documento_numero: docNumeroUnico,
        motivo: motivo.trim() || undefined,
        observacao: observacao.trim() || undefined,
        // Lote/Validade
        lote_id: item.loteId || undefined,
        numero_lote: item.numeroLote?.trim() || undefined,
        data_fabricacao: item.dataFabricacao || undefined,
        data_validade: item.dataValidade || undefined,
      }))

      // Dispara chamada atômica
      const res = await movimentarEstoque(itensPayload)

      if (res.sucesso) {
        toast({
          title: 'Lançamento efetuado com sucesso!',
          description: `${res.total} movimentação(ões) gravada(s) no estoque da filial.`,
        })

        // Prepara resumo para modal
        setResumoGravado({
          totalItens: res.total,
          movimentos: res.movimentos.map((m) => ({
            produto: m.produto_descricao,
            quantidade: m.quantidade,
            saldoPosterior: m.saldo_posterior,
            custoMedioPosterior: m.custo_medio_posterior,
          })),
        })
        setModalResumoAberto(true)

        // Limpa formulário
        setGradeItens([])
        setMotivo('')
        setObservacao('')
      } else {
        toast({
          title: 'Erro ao movimentar estoque',
          description: res.message,
          variant: 'destructive',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha no lançamento',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Carregar histórico de lançamentos agrupados por documento
  const carregarHistorico = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregandoHistorico(true)

    try {
      const conds: string[] = [`empresa_id = '${empresaAtiva.id}'`]

      if (filtroHistoricoOrigem !== 'todos') {
        conds.push(`origem = '${filtroHistoricoOrigem}'`)
      } else {
        // Origens típicas de lançamentos manuais
        conds.push(
          `(origem = 'SALDO_INICIAL' || origem = 'AJUSTE_ENTRADA' || origem = 'AJUSTE_SAIDA' || origem = 'PERDA' || origem = 'CONSUMO_INTERNO' || origem = 'BONIFICACAO_ENTRADA' || origem = 'BONIFICACAO_SAIDA' || origem = 'ESTORNO')`,
        )
      }

      if (filtroHistoricoInicio) {
        conds.push(`data_movimento >= '${filtroHistoricoInicio}T00:00:00.000Z'`)
      }
      if (filtroHistoricoFim) {
        conds.push(`data_movimento <= '${filtroHistoricoFim}T23:59:59.999Z'`)
      }
      if (filtroHistoricoUsuario !== 'todos') {
        conds.push(`usuario_id = '${filtroHistoricoUsuario}'`)
      }

      const res = await pb.collection('estoque_movimentos').getFullList<EstoqueMovimento>({
        filter: conds.join(' && '),
        sort: '-data_movimento,-created',
        expand: 'produto_id',
      })

      setHistoricoMovimentos(res)
    } catch (err) {
      console.error('Erro ao buscar histórico de lançamentos:', err)
    } finally {
      setCarregandoHistorico(false)
    }
  }, [
    empresaAtiva,
    filtroHistoricoOrigem,
    filtroHistoricoInicio,
    filtroHistoricoFim,
    filtroHistoricoUsuario,
  ])

  useEffect(() => {
    if (abaAtiva === 'historico') {
      carregarHistorico()
    }
  }, [abaAtiva, carregarHistorico])

  // Agrupa movimentos do histórico por documento
  const gruposHistorico = useMemo(() => {
    const mapa = new Map<string, EstoqueMovimento[]>()

    historicoMovimentos.forEach((m) => {
      // Chave de agrupamento: documento_numero ou documento_tipo ou data
      const docKey = m.documento_numero || `${m.origem}_${m.data_movimento.slice(0, 16)}`
      if (!mapa.has(docKey)) {
        mapa.set(docKey, [])
      }
      mapa.get(docKey)!.push(m)
    })

    return Array.from(mapa.entries()).map(([chave, itens]) => {
      const primeiro = itens[0]
      return {
        chave,
        documentoNumero: primeiro.documento_numero || '—',
        documentoTipo: primeiro.documento_tipo || 'Ajuste Manual',
        origem: primeiro.origem,
        tipo: primeiro.tipo,
        data: primeiro.data_movimento,
        usuarioId: primeiro.usuario_id,
        motivo: primeiro.motivo,
        observacao: primeiro.observacao,
        itens,
      }
    })
  }, [historicoMovimentos])

  const formatarQtd = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  }

  const formatarMoeda = (val?: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Lançamentos de Estoque</h1>
            {empresaAtiva && (
              <Badge
                variant="outline"
                className="text-xs font-normal border-slate-300 text-slate-700"
              >
                {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajustes manuais, implantação de saldo inicial, perdas, consumo interno e bonificações
          </p>
        </div>

        {/* Abas e Ações */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setAbaAtiva('novo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                abaAtiva === 'novo'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Novo Lançamento
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('historico')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                abaAtiva === 'historico'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lançamentos Realizados
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setModalImportarCsvAberto(true)}
            className="h-9 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
            Importar Saldo Inicial CSV
          </Button>
        </div>
      </div>

      {abaAtiva === 'novo' ? (
        /* ======================================================== */
        /* ABA 1: FORMULÁRIO DE NOVO LANÇAMENTO */
        /* ======================================================== */
        <div className="space-y-4">
          <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Parâmetros da Operação
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Tipo de Lançamento */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Tipo de Lançamento *
                  </Label>
                  <Select
                    value={tipoLancamento}
                    onValueChange={(val) => setTipoLancamento(val as TipoLancamentoForm)}
                  >
                    <SelectTrigger className="h-10 text-xs">
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Saldo inicial">Saldo inicial (Implantação)</SelectItem>
                      <SelectItem value="Ajuste de entrada">
                        Ajuste de entrada (Sobra física)
                      </SelectItem>
                      <SelectItem value="Ajuste de saída">
                        Ajuste de saída (Falta física)
                      </SelectItem>
                      <SelectItem value="Perda/avaria">Perda/avaria (Descarte ou dano)</SelectItem>
                      <SelectItem value="Consumo interno">
                        Consumo interno (Uso da empresa)
                      </SelectItem>
                      <SelectItem value="Bonificação recebida">Bonificação recebida</SelectItem>
                      <SelectItem value="Bonificação enviada">Bonificação enviada</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Direção:{' '}
                    <strong
                      className={
                        configAtual.tipo === 'Entrada' ? 'text-emerald-700' : 'text-rose-700'
                      }
                    >
                      {configAtual.tipo}
                    </strong>{' '}
                    • Origem fiscal: {configAtual.origem}
                  </span>
                </div>

                {/* Data do Movimento */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Data do Movimento *
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                      type="datetime-local"
                      value={dataMovimento}
                      onChange={(e) => setDataMovimento(e.target.value)}
                      className="pl-9 h-10 text-xs"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {tipoLancamento === 'Saldo inicial'
                      ? 'Permite data retroativa de implantação'
                      : 'Padrão: data e hora atual'}
                  </span>
                </div>

                {/* Motivo */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Motivo da Operação {configAtual.motivoObrigatorio ? '*' : '(Opcional)'}
                  </Label>
                  <Input
                    type="text"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex: Contagem física anual, avaria de transporte..."
                    className="h-10 text-xs"
                    required={configAtual.motivoObrigatorio}
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    {configAtual.motivoObrigatorio
                      ? 'Obrigatório para operações de ajuste, perda e consumo'
                      : 'Justificativa do lançamento'}
                  </span>
                </div>
              </div>

              {/* Observação Geral */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Observações Complementares
                </Label>
                <Input
                  type="text"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Informações adicionais para auditoria..."
                  className="h-9 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Campo de Leitura de Código de Barras / Adição de Itens */}
          <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between border-b border-slate-100">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Grade de Itens do Lançamento
                </CardTitle>
                <p className="text-[11px] text-slate-500">
                  Bipe o código de barras (GTIN) ou digite o código/descrição para adicionar
                  automaticamente.
                </p>
              </div>

              <Badge variant="outline" className="font-mono text-xs">
                {gradeItens.length} produto(s)
              </Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Leitor de código de barras */}
              <div className="max-w-2xl">
                <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Leitor de Código de Barras / Busca Rápida
                </Label>
                <BuscaProdutoGtin
                  onSelecionarProduto={(prod, qtd) => handleAdicionarProduto(prod, qtd || 1)}
                  filtroControlaEstoque
                  autoFoco
                  placeholder="Bipe o GTIN/EAN com o leitor ou digite o código do produto e pressione Enter..."
                />
              </div>

              {/* Tabela da Grade de Itens */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5">Produto</th>
                      <th className="p-2.5 text-center">Unid.</th>
                      <th className="p-2.5 text-right">Saldo Atual</th>
                      <th className="p-2.5 text-right w-32">Quantidade *</th>
                      <th className="p-2.5 w-64">
                        {configAtual.tipo === 'Entrada'
                          ? 'Lote e Validade *'
                          : 'Seletor de Lote (FEFO)'}
                      </th>
                      {!configAtual.custoOculto && (
                        <th className="p-2.5 text-right w-36">
                          Custo Unitário (R$) {configAtual.custoObrigatorio ? '*' : '(Opcional)'}
                        </th>
                      )}
                      <th className="p-2.5 text-right">Saldo Após</th>
                      <th className="p-2.5 text-center w-16">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {gradeItens.length === 0 ? (
                      <tr>
                        <td
                          colSpan={configAtual.custoOculto ? 7 : 8}
                          className="py-10 text-center text-slate-400"
                        >
                          <Layers className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                          <p className="font-semibold text-slate-600">Grade vazia</p>
                          <p className="text-[11px] mt-0.5">
                            Bipe o código de barras ou use a busca para incluir produtos no
                            lançamento.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      gradeItens.map((item, index) => {
                        const p = item.produto
                        const isSaida = configAtual.tipo === 'Saída'
                        const saldoApos = isSaida
                          ? item.saldoAtual - item.quantidade
                          : item.saldoAtual + item.quantidade
                        const saldoNegativo = saldoApos < 0

                        return (
                          <tr key={item.idTemp} className="hover:bg-slate-50/70">
                            <td className="p-2.5 text-center font-mono text-slate-400">
                              {index + 1}
                            </td>
                            <td className="p-2.5">
                              <div className="font-semibold text-slate-900">
                                <span className="font-mono text-blue-700 mr-1.5">#{p.codigo}</span>
                                {p.descricao}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                {p.gtin && <span className="font-mono">GTIN: {p.gtin}</span>}
                                {p.localizacao && <span>Local: {p.localizacao}</span>}
                              </div>
                            </td>
                            <td className="p-2.5 text-center font-semibold text-slate-600 uppercase">
                              {p.expand?.unidade_id?.sigla || 'UN'}
                            </td>
                            {/* Saldo Atual (só leitura) */}
                            <td className="p-2.5 text-right font-mono text-slate-600 font-medium">
                              {formatarQtd(item.saldoAtual)}
                            </td>
                            {/* Quantidade (editável) */}
                            <td className="p-2.5 text-right">
                              <Input
                                type="number"
                                step="0.0001"
                                min="0.0001"
                                value={item.quantidade}
                                onChange={(e) =>
                                  handleAtualizarQuantidade(
                                    item.idTemp,
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="h-8 text-xs text-right font-mono font-bold"
                              />
                            </td>
                            {/* Coluna de Lote e Validade */}
                            <td className="p-2.5">
                              {p.controla_lote_validade ? (
                                configAtual.tipo === 'Entrada' ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <Input
                                        type="text"
                                        placeholder="Nº Lote *"
                                        value={item.numeroLote || ''}
                                        onChange={(e) =>
                                          handleAtualizarCampoItem(
                                            item.idTemp,
                                            'numeroLote',
                                            e.target.value,
                                          )
                                        }
                                        className="h-7 text-[11px] font-mono"
                                      />
                                      <Input
                                        type="date"
                                        title="Data de Validade (obrigatória)"
                                        value={item.dataValidade || ''}
                                        onChange={(e) =>
                                          handleAtualizarCampoItem(
                                            item.idTemp,
                                            'dataValidade',
                                            e.target.value,
                                          )
                                        }
                                        className="h-7 text-[11px] font-mono"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                      <span>Fabricação:</span>
                                      <input
                                        type="date"
                                        value={item.dataFabricacao || ''}
                                        onChange={(e) =>
                                          handleAtualizarCampoItem(
                                            item.idTemp,
                                            'dataFabricacao',
                                            e.target.value,
                                          )
                                        }
                                        className="h-6 text-[10px] rounded border border-slate-200 px-1 font-mono"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <Select
                                      value={item.loteId || 'auto_fefo'}
                                      onValueChange={(val) =>
                                        handleAtualizarCampoItem(
                                          item.idTemp,
                                          'loteId',
                                          val === 'auto_fefo' ? '' : val,
                                        )
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-[11px] font-mono">
                                        <SelectValue placeholder="Automático (FEFO)" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="auto_fefo">
                                          ⚡ Automático (FEFO - vence primeiro)
                                        </SelectItem>
                                        {(lotesPorProduto[p.id] || []).map((lote) => {
                                          const vParte = lote.data_validade.slice(0, 10)
                                          return (
                                            <SelectItem key={lote.id} value={lote.id}>
                                              Lote: {lote.numero_lote} (Saldo:{' '}
                                              {lote.quantidade.toFixed(2)} | Venc: {vParte})
                                            </SelectItem>
                                          )
                                        })}
                                      </SelectContent>
                                    </Select>
                                    <span className="text-[9px] text-slate-400 block mt-0.5">
                                      {item.loteId
                                        ? 'Lote específico selecionado'
                                        : 'Sugestão FEFO ativa: consumirá lotes mais antigos'}
                                    </span>
                                  </div>
                                )
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">
                                  Sem controle de lote
                                </span>
                              )}
                            </td>
                            {/* Custo Unitário (editável quando visível) */}
                            {!configAtual.custoOculto && (
                              <td className="p-2.5 text-right">
                                <Input
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  value={item.custoUnitario !== undefined ? item.custoUnitario : ''}
                                  onChange={(e) =>
                                    handleAtualizarCusto(
                                      item.idTemp,
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  placeholder={
                                    item.custoMedioAtual
                                      ? item.custoMedioAtual.toFixed(4)
                                      : '0,0000'
                                  }
                                  className="h-8 text-xs text-right font-mono"
                                />
                                {!configAtual.custoObrigatorio && (
                                  <span className="text-[9px] text-slate-400 block mt-0.5">
                                    Vazio = manter {formatarMoeda(item.custoMedioAtual)}
                                  </span>
                                )}
                              </td>
                            )}
                            {/* Saldo Após (calculado) */}
                            <td
                              className={`p-2.5 text-right font-mono font-bold ${
                                saldoNegativo ? 'text-rose-600' : 'text-slate-900'
                              }`}
                            >
                              {formatarQtd(saldoApos)}
                              {saldoNegativo && (
                                <span className="text-[9px] text-rose-500 block">negativo</span>
                              )}
                            </td>
                            {/* Ações */}
                            <td className="p-2.5 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoverItemGrade(item.idTemp)}
                                className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                                title="Remover da grade"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Botão Salvar / Resumo */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  {gradeItens.length > 0 && (
                    <span>
                      Total de itens na grade:{' '}
                      <strong className="text-slate-900">{gradeItens.length}</strong> • Soma das
                      quantidades:{' '}
                      <strong className="text-slate-900">
                        {formatarQtd(gradeItens.reduce((acc, i) => acc + i.quantidade, 0))}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGradeItens([])
                      setMotivo('')
                      setObservacao('')
                    }}
                    disabled={salvando || gradeItens.length === 0}
                    className="h-9 text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                    Limpar Grade
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSalvarLancamento}
                    disabled={salvando || gradeItens.length === 0}
                    className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {salvando ? 'Gravando...' : 'Gravar Lançamento no Estoque'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ======================================================== */
        /* ABA 2: HISTÓRICO DE LANÇAMENTOS AGRUPADOS */
        /* ======================================================== */
        <div className="space-y-4">
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {/* Período Início */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                    Data Início
                  </Label>
                  <Input
                    type="date"
                    value={filtroHistoricoInicio}
                    onChange={(e) => setFiltroHistoricoInicio(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Período Fim */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                    Data Fim
                  </Label>
                  <Input
                    type="date"
                    value={filtroHistoricoFim}
                    onChange={(e) => setFiltroHistoricoFim(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Tipo / Origem */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                    Tipo de Operação
                  </Label>
                  <Select value={filtroHistoricoOrigem} onValueChange={setFiltroHistoricoOrigem}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todas as origens" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os tipos manuais</SelectItem>
                      <SelectItem value="SALDO_INICIAL">Saldo inicial</SelectItem>
                      <SelectItem value="AJUSTE_ENTRADA">Ajuste de entrada</SelectItem>
                      <SelectItem value="AJUSTE_SAIDA">Ajuste de saída</SelectItem>
                      <SelectItem value="PERDA">Perda/avaria</SelectItem>
                      <SelectItem value="CONSUMO_INTERNO">Consumo interno</SelectItem>
                      <SelectItem value="BONIFICACAO_ENTRADA">Bonificação recebida</SelectItem>
                      <SelectItem value="BONIFICACAO_SAIDA">Bonificação enviada</SelectItem>
                      <SelectItem value="ESTORNO">Estornos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Usuário */}
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                    Usuário Operador
                  </Label>
                  <Select value={filtroHistoricoUsuario} onValueChange={setFiltroHistoricoUsuario}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Todos os usuários" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os usuários</SelectItem>
                      {usuariosDoSistema.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={carregarHistorico}
                  disabled={carregandoHistorico}
                  className="h-8 text-xs"
                >
                  <RefreshCw
                    className={`h-3 w-3 mr-1 ${carregandoHistorico ? 'animate-spin' : ''}`}
                  />
                  Filtrar Lançamentos
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Grupos de Lançamento */}
          <div className="space-y-3">
            {carregandoHistorico ? (
              <div className="py-12 text-center text-slate-400 bg-white rounded-lg border border-slate-200">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                <span className="text-xs">Carregando histórico de lançamentos...</span>
              </div>
            ) : gruposHistorico.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-white rounded-lg border border-slate-200">
                <Layers className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600 text-xs">Nenhum lançamento encontrado</p>
                <p className="text-[11px] mt-0.5">
                  Tente ampliar o período ou selecionar outro tipo.
                </p>
              </div>
            ) : (
              gruposHistorico.map((grupo) => (
                <Card key={grupo.chave} className="border-slate-200 bg-white shadow-xs">
                  <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge
                        className={`text-xs ${
                          grupo.tipo === 'Entrada'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        {grupo.origem}
                      </Badge>
                      <span className="font-mono text-xs font-semibold text-slate-700">
                        Doc: {grupo.documentoNumero}
                      </span>
                      <span className="text-slate-400 text-xs">•</span>
                      <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {new Date(grupo.data).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 font-medium">
                      {grupo.itens.length} produto(s) movimentado(s)
                    </div>
                  </CardHeader>

                  <CardContent className="p-3 text-xs space-y-2">
                    {grupo.motivo && (
                      <div className="text-slate-700">
                        <strong>Motivo:</strong> {grupo.motivo}
                      </div>
                    )}
                    {grupo.observacao && (
                      <div className="text-slate-500 text-[11px]">
                        <strong>Obs:</strong> {grupo.observacao}
                      </div>
                    )}

                    {/* Tabela resumida de itens do lote */}
                    <div className="border border-slate-200 rounded-md overflow-hidden mt-2">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-[9px] border-b border-slate-200">
                          <tr>
                            <th className="p-2">Produto</th>
                            <th className="p-2 text-right">Qtd</th>
                            <th className="p-2 text-right">Custo Unitário</th>
                            <th className="p-2 text-right">Saldo Anterior</th>
                            <th className="p-2 text-right">Saldo Posterior</th>
                            <th className="p-2 text-right">Custo Médio Pos.</th>
                            <th className="p-2 text-center">Situação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grupo.itens.map((m) => (
                            <tr
                              key={m.id}
                              className={m.estornado ? 'line-through opacity-50 bg-slate-50' : ''}
                            >
                              <td className="p-2 font-medium text-slate-900">
                                <span className="font-mono text-slate-500 mr-1">
                                  #{m.expand?.produto_id?.codigo}
                                </span>
                                {m.expand?.produto_id?.descricao || 'Produto'}
                              </td>
                              <td className="p-2 text-right font-mono font-bold text-slate-900">
                                {formatarQtd(m.quantidade)}
                              </td>
                              <td className="p-2 text-right font-mono text-slate-600">
                                {formatarMoeda(m.custo_unitario)}
                              </td>
                              <td className="p-2 text-right font-mono text-slate-500">
                                {formatarQtd(m.saldo_anterior)}
                              </td>
                              <td className="p-2 text-right font-mono font-bold text-blue-700">
                                {formatarQtd(m.saldo_posterior)}
                              </td>
                              <td className="p-2 text-right font-mono text-slate-700">
                                {formatarMoeda(m.custo_medio_posterior)}
                              </td>
                              <td className="p-2 text-center">
                                {m.estornado ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] text-rose-600 border-rose-300"
                                  >
                                    Estornado
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">
                                    Efetivado
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal de Importação CSV */}
      <ImportarSaldoInicialModal
        aberto={modalImportarCsvAberto}
        onOpenChange={setModalImportarCsvAberto}
        onSucesso={() => {
          setAbaAtiva('historico')
          carregarHistorico()
        }}
      />

      {/* Modal de Resumo após Salvar */}
      <Dialog open={modalResumoAberto} onOpenChange={setModalResumoAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <DialogTitle className="text-base font-bold text-slate-900">
                Resumo do Lançamento de Estoque
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-600">
              Todas as movimentações foram processadas em transação atômica.
            </DialogDescription>
          </DialogHeader>

          {resumoGravado && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-900">
                <strong>{resumoGravado.totalItens} produto(s)</strong> atualizado(s) no estoque da
                filial.
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5">Produto</th>
                      <th className="p-2.5 text-right">Qtd Movimentada</th>
                      <th className="p-2.5 text-right">Saldo Resultante</th>
                      <th className="p-2.5 text-right">Custo Médio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumoGravado.movimentos.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 font-medium text-slate-900">{m.produto}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          {formatarQtd(m.quantidade)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-blue-700">
                          {formatarQtd(m.saldoPosterior)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-emerald-700">
                          {formatarMoeda(m.custoMedioPosterior)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setModalResumoAberto(false)}
              className="text-xs bg-blue-600 text-white"
            >
              OK, Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default LancamentosEstoquePage
