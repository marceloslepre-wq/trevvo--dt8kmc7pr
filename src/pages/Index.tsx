import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Truck,
  Box,
  FileCheck,
  UserCheck,
  AlertTriangle,
  ArrowRight,
  Clock,
  Sparkles,
  RefreshCw,
  Building,
  Calculator,
  Layers,
  FileSpreadsheet,
  ArrowLeftRight,
  ShoppingCart,
  FileText,
  ShoppingBag,
  CreditCard,
  FileX2,
  FileCheck2,
  FileClock,
  Award,
  ShieldAlert,
  FileCheck2 as FileCheck2Icon,
} from 'lucide-react'
import { contarTransferenciasAguardandoRecebimento } from '@/services/transferencias'
import { listarEmpresasAtivas, Empresa } from '@/services/empresas'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import pb from '@/lib/pocketbase/client'
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  CalendarClock,
  ClipboardList,
  ArrowUpRight,
  ArrowDownLeft,
  Landmark,
  LineChart as LineChartIcon,
} from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { apurarFluxoCaixa, PeriodoFluxoCaixa } from '@/services/fluxoCaixa'

interface UltimoCadastro {
  id: string
  tipo: 'cliente' | 'fornecedor' | 'produto'
  tipoLabel: string
  codigo: string | number
  identificacao: string
  criadoEm: string
  createdDate: Date
  urlDetalhe: string
}

interface PendenciaConfiguracao {
  id: string
  titulo: string
  descricao: string
  link: string
  modulo: string
  gravidade: 'alta' | 'media' | 'baixa'
}

export default function Index() {
  const { user } = useAuth()
  const { pode } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()
  const { config } = useConfiguracoes()

  const [carregando, setCarregando] = useState(true)

  // Totais
  const [totalClientesAtivos, setTotalClientesAtivos] = useState<number>(0)
  const [totalFornecedoresAtivos, setTotalFornecedoresAtivos] = useState<number>(0)
  const [totalProdutosAtivos, setTotalProdutosAtivos] = useState<number>(0)
  const [totalProdutosFiscalIncompleto, setTotalProdutosFiscalIncompleto] = useState<number>(0)
  const [totalUsuariosAtivos, setTotalUsuariosAtivos] = useState<number>(0)
  const [totalTransferenciasReceber, setTotalTransferenciasReceber] = useState<number>(0)

  // Indicadores de Estoque (Etapa 2)
  const [valorTotalEstoque, setValorTotalEstoque] = useState<number>(0)
  const [produtosAbaixoMinimoCount, setProdutosAbaixoMinimoCount] = useState<number>(0)
  const [lotesVencidosCount, setLotesVencidosCount] = useState<number>(0)
  const [lotesAVencerCount, setLotesAVencerCount] = useState<number>(0)
  const [inventariosAbertosCount, setInventariosAbertosCount] = useState<number>(0)
  const [ultimasMovimentacoesEstoque, setUltimasMovimentacoesEstoque] = useState<any[]>([])

  // Indicadores de Compras e Entrada de Notas (Etapa 3)
  const [notasEmConferenciaCount, setNotasEmConferenciaCount] = useState<number>(0)
  const [comprasDoMesTotal, setComprasDoMesTotal] = useState<number>(0)
  const [pedidosCompraAbertosCount, setPedidosCompraAbertosCount] = useState<number>(0)
  const [pedidosPrevisaoVencidaCount, setPedidosPrevisaoVencidaCount] = useState<number>(0)

  // Indicadores Financeiros (Etapa 4)
  const [aPagarHojeTotal, setAPagarHojeTotal] = useState<number>(0)
  const [aPagarHojeCount, setAPagarHojeCount] = useState<number>(0)
  const [aPagarVencidoTotal, setAPagarVencidoTotal] = useState<number>(0)
  const [aPagarVencidoCount, setAPagarVencidoCount] = useState<number>(0)
  const [aReceberHojeTotal, setAReceberHojeTotal] = useState<number>(0)
  const [aReceberHojeCount, setAReceberHojeCount] = useState<number>(0)
  const [aReceberVencidoTotal, setAReceberVencidoTotal] = useState<number>(0)
  const [aReceberVencidoCount, setAReceberVencidoCount] = useState<number>(0)
  const [saldoTotalContas, setSaldoTotalContas] = useState<number>(0)
  const [totalContasCadastradas, setTotalContasCadastradas] = useState<number>(0)
  const [dadosFluxo30Dias, setDadosFluxo30Dias] = useState<PeriodoFluxoCaixa[]>([])
  const [carregandoFluxo, setCarregandoFluxo] = useState<boolean>(false)

  // Indicadores de Vendas e PDV (Etapa 5)
  const [vendasHojeValor, setVendasHojeValor] = useState<number>(0)
  const [vendasHojeQtd, setVendasHojeQtd] = useState<number>(0)
  const [ticketMedioHoje, setTicketMedioHoje] = useState<number>(0)
  const [caixasAbertosCount, setCaixasAbertosCount] = useState<number>(0)
  const [orcamentosVencendoCount, setOrcamentosVencendoCount] = useState<number>(0)
  const [vendasMesAtualTotal, setVendasMesAtualTotal] = useState<number>(0)
  const [vendasMesAnteriorTotal, setVendasMesAnteriorTotal] = useState<number>(0)
  const [graficoVendas30Dias, setGraficoVendas30Dias] = useState<
    Array<{ dia: string; rotulo: string; valor: number }>
  >([])
  const [carregandoVendas, setCarregandoVendas] = useState<boolean>(false)

  // Últimos cadastros
  const [ultimosCadastros, setUltimosCadastros] = useState<UltimoCadastro[]>([])

  // Pendências de configuração
  const [pendencias, setPendencias] = useState<PendenciaConfiguracao[]>([])

  // Indicadores Fiscais (Etapa 6 e 7)
  const [notasRejeitadasCount, setNotasRejeitadasCount] = useState<number>(0)
  const [notasProcessandoCount, setNotasProcessandoCount] = useState<number>(0)
  const [notasEmitidasHojeCount, setNotasEmitidasHojeCount] = useState<number>(0)
  const [diasVencimentoCertificado, setDiasVencimentoCertificado] = useState<number | null>(null)
  const [dataVencimentoCertificadoStr, setDataVencimentoCertificadoStr] = useState<string | null>(
    null,
  )
  const [ambienteHomologacaoAtivo, setAmbienteHomologacaoAtivo] = useState<boolean>(false)

  // Indicador de SPED do mês anterior (Etapa 7 - Prompt 7.6b)
  const [statusSpedEmpresas, setStatusSpedEmpresas] = useState<
    Array<{
      empresa: Empresa
      periodo: string
      statusFormatado: 'não gerado' | 'gerado com erros' | 'gerado' | 'entregue'
    }>
  >([])

  // Permissões de cada módulo relevante
  const podeVerFiscal = pode('notas_saida', 'ver') || pode('tabelas_fiscais', 'ver')
  const podeVerClientes = pode('clientes', 'ver')
  const podeVerFornecedores = pode('fornecedores', 'ver')
  const podeVerProdutos = pode('produtos', 'ver')
  const podeVerUsuarios = pode('usuarios', 'ver')
  const podeVerEmpresas = pode('empresas', 'ver')
  const podeVerTabelasFiscais = pode('tabelas_fiscais', 'ver')
  const podeVerEstoque = pode('estoque', 'ver')
  const podeVerCompras = pode('compras', 'ver')
  const podeVerNotasEntrada = pode('notas_entrada', 'ver')
  const podeVerFinanceiroPagar = pode('financeiro_pagar', 'ver')
  const podeVerFinanceiroReceber = pode('financeiro_receber', 'ver')
  const podeVerFinanceiroBancos = pode('financeiro_bancos', 'ver')
  const podeVerVendas = pode('vendas', 'ver') || pode('pdv', 'ver')

  const carregarDadosPainel = useCallback(async () => {
    try {
      setCarregando(true)

      // 1. Carregar contagens condicionadas a permissões
      const promisesContagens: Promise<void>[] = []

      if (podeVerClientes) {
        promisesContagens.push(
          pb
            .collection('clientes')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalClientesAtivos(res.totalItems))
            .catch(() => setTotalClientesAtivos(0)),
        )
      }

      if (podeVerFornecedores) {
        promisesContagens.push(
          pb
            .collection('fornecedores')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalFornecedoresAtivos(res.totalItems))
            .catch(() => setTotalFornecedoresAtivos(0)),
        )
      }

      if (podeVerProdutos) {
        promisesContagens.push(
          pb
            .collection('produtos')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalProdutosAtivos(res.totalItems))
            .catch(() => setTotalProdutosAtivos(0)),
        )

        // Produtos com fiscal incompleto: fiscal_revisado = false ou ncm = ''
        promisesContagens.push(
          pb
            .collection('produtos')
            .getList(1, 1, { filter: "ativo = true && (fiscal_revisado = false || ncm = '')" })
            .then((res) => setTotalProdutosFiscalIncompleto(res.totalItems))
            .catch(() => setTotalProdutosFiscalIncompleto(0)),
        )
      }

      if (podeVerUsuarios) {
        promisesContagens.push(
          pb
            .collection('usuarios')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalUsuariosAtivos(res.totalItems))
            .catch(() => setTotalUsuariosAtivos(0)),
        )
      }

      if (podeVerEstoque && empresaAtiva?.id) {
        // 1. Transferências aguardando recebimento
        promisesContagens.push(
          contarTransferenciasAguardandoRecebimento(empresaAtiva.id)
            .then((tot) => setTotalTransferenciasReceber(tot))
            .catch(() => setTotalTransferenciasReceber(0)),
        )

        // 2. Inventários abertos na empresa ativa
        promisesContagens.push(
          pb
            .collection('inventarios')
            .getList(1, 1, {
              filter: `empresa_id = '${empresaAtiva.id}' && status = 'Aberto'`,
            })
            .then((res) => setInventariosAbertosCount(res.totalItems))
            .catch(() => setInventariosAbertosCount(0)),
        )

        // 3. Valor total do estoque da empresa ativa e produtos abaixo do mínimo
        promisesContagens.push(
          (async () => {
            try {
              // Buscar todos os saldos da empresa ativa
              const saldos = await pb.collection('estoque_saldos').getFullList({
                filter: `empresa_id = '${empresaAtiva.id}' && ativo = true`,
                expand: 'produto_id',
              })

              let totalVal = 0
              let abaixoMinimo = 0

              saldos.forEach((s: any) => {
                const qtd = Number(s.quantidade) || 0
                const custoMedio = Number(s.custo_medio) || 0
                const valTotal = Number(s.valor_total) || qtd * custoMedio
                if (qtd > 0 && valTotal > 0) {
                  totalVal += valTotal
                }

                const prod = s.expand?.produto_id
                const estoqueMinimo = Number(prod?.estoque_minimo) || 0
                if (estoqueMinimo > 0 && qtd < estoqueMinimo) {
                  abaixoMinimo++
                }
              })

              setValorTotalEstoque(totalVal)
              setProdutosAbaixoMinimoCount(abaixoMinimo)
            } catch (err) {
              console.warn('Erro ao calcular valor total e abaixo do mínimo:', err)
              setValorTotalEstoque(0)
              setProdutosAbaixoMinimoCount(0)
            }
          })(),
        )

        // 4. Lotes vencidos e a vencer (próximos 30 dias) da empresa ativa
        promisesContagens.push(
          (async () => {
            try {
              const hoje = new Date()
              const hojeIso = hoje.toISOString().split('T')[0]
              const daqui30Dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000)
              const daqui30DiasIso = daqui30Dias.toISOString().split('T')[0]

              // Lotes com saldo > 0 na empresa ativa
              const lotes = await pb.collection('lotes').getFullList({
                filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && quantidade_saldo > 0`,
              })

              let vencidos = 0
              let aVencer = 0

              lotes.forEach((l: any) => {
                if (!l.data_validade) return
                const valStr = l.data_validade.split('T')[0]
                if (valStr < hojeIso) {
                  vencidos++
                } else if (valStr <= daqui30DiasIso) {
                  aVencer++
                }
              })

              setLotesVencidosCount(vencidos)
              setLotesAVencerCount(aVencer)
            } catch (err) {
              console.warn('Erro ao contar lotes vencidos e a vencer:', err)
              setLotesVencidosCount(0)
              setLotesAVencerCount(0)
            }
          })(),
        )

        // 5. Últimas 10 movimentações da empresa ativa
        promisesContagens.push(
          pb
            .collection('estoque_movimentos')
            .getList(1, 10, {
              filter: `empresa_id = '${empresaAtiva.id}'`,
              sort: '-data_movimento,-created',
              expand: 'produto_id',
            })
            .then((res) => setUltimasMovimentacoesEstoque(res.items))
            .catch(() => setUltimasMovimentacoesEstoque([])),
        )
      }

      // Indicadores de Compras e Entrada de Notas (Etapa 3)
      if (empresaAtiva?.id) {
        // Notas de Entrada
        if (podeVerNotasEntrada) {
          // Notas em conferência
          promisesContagens.push(
            pb
              .collection('notas_entrada')
              .getList(1, 1, {
                filter: `empresa_id = '${empresaAtiva.id}' && status = 'Em conferência' && ativo = true`,
              })
              .then((res) => setNotasEmConferenciaCount(res.totalItems))
              .catch(() => setNotasEmConferenciaCount(0)),
          )

          // Compras do mês (notas lançadas no mês corrente da data de entrada)
          promisesContagens.push(
            (async () => {
              try {
                const hoje = new Date()
                const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
                  .toISOString()
                  .split('T')[0]
                const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
                  .toISOString()
                  .split('T')[0]

                const notasMes = await pb.collection('notas_entrada').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && status = 'Lançada' && ativo = true && data_entrada >= '${primeiroDiaMes}' && data_entrada <= '${ultimoDiaMes}'`,
                  fields: 'valor_total',
                })

                const totalMes = notasMes.reduce(
                  (acc: number, n: any) => acc + (Number(n.valor_total) || 0),
                  0,
                )
                setComprasDoMesTotal(totalMes)
              } catch (err) {
                console.warn('Erro ao calcular compras do mês:', err)
                setComprasDoMesTotal(0)
              }
            })(),
          )
        }

        // Pedidos de Compra
        if (podeVerCompras) {
          // Pedidos em aberto (status "Enviado" ou "Parcialmente recebido")
          promisesContagens.push(
            pb
              .collection('pedidos_compra')
              .getList(1, 1, {
                filter: `empresa_id = '${empresaAtiva.id}' && (status = 'Enviado' || status = 'Parcialmente recebido') && ativo = true`,
              })
              .then((res) => setPedidosCompraAbertosCount(res.totalItems))
              .catch(() => setPedidosCompraAbertosCount(0)),
          )

          // Pedidos com previsão de entrega vencida: data_previsao_entrega < hoje e status não Recebidos/Cancelados
          promisesContagens.push(
            (async () => {
              try {
                const hojeIso = new Date().toISOString().split('T')[0]
                const pedidosVencidos = await pb.collection('pedidos_compra').getList(1, 1, {
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && status != 'Recebido' && status != 'Cancelado' && data_previsao_entrega != '' && data_previsao_entrega < '${hojeIso}'`,
                })
                setPedidosPrevisaoVencidaCount(pedidosVencidos.totalItems)
              } catch (err) {
                console.warn('Erro ao contar pedidos com previsão vencida:', err)
                setPedidosPrevisaoVencidaCount(0)
              }
            })(),
          )
        }

        // Indicadores Financeiros (Etapa 4)
        const hojeIso = new Date().toISOString().split('T')[0]

        // Contas a Pagar (Hoje e Vencidos)
        if (podeVerFinanceiroPagar) {
          promisesContagens.push(
            (async () => {
              try {
                // A pagar hoje: status in ('Em aberto', 'Pago parcial') && data_vencimento = hojeIso
                const titulosHoje = await pb.collection('contas_pagar').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && (status = 'Em aberto' || status = 'Pago parcial') && data_vencimento = '${hojeIso}'`,
                  fields: 'saldo,valor_original',
                })
                let somaSaldosHoje = 0
                titulosHoje.forEach((t: any) => {
                  somaSaldosHoje += Number(t.saldo ?? t.valor_original) || 0
                })
                setAPagarHojeTotal(somaSaldosHoje)
                setAPagarHojeCount(titulosHoje.length)

                // A pagar vencido: status in ('Em aberto', 'Pago parcial') && data_vencimento < hojeIso
                const titulosVencidos = await pb.collection('contas_pagar').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && (status = 'Em aberto' || status = 'Pago parcial') && data_vencimento < '${hojeIso}'`,
                  fields: 'saldo,valor_original',
                })
                let somaSaldosVenc = 0
                titulosVencidos.forEach((t: any) => {
                  somaSaldosVenc += Number(t.saldo ?? t.valor_original) || 0
                })
                setAPagarVencidoTotal(somaSaldosVenc)
                setAPagarVencidoCount(titulosVencidos.length)
              } catch (err) {
                console.warn('Erro ao carregar indicadores de contas a pagar:', err)
                setAPagarHojeTotal(0)
                setAPagarHojeCount(0)
                setAPagarVencidoTotal(0)
                setAPagarVencidoCount(0)
              }
            })(),
          )
        }

        // Contas a Receber (Hoje e Vencidos)
        if (podeVerFinanceiroReceber) {
          promisesContagens.push(
            (async () => {
              try {
                // A receber hoje: status in ('Aberto', 'Parcial') && data_vencimento = hojeIso
                const titulosHoje = await pb.collection('contas_receber').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && (status = 'Aberto' || status = 'Parcial') && data_vencimento = '${hojeIso}'`,
                  fields: 'saldo,valor_original',
                })
                let somaSaldosHoje = 0
                titulosHoje.forEach((t: any) => {
                  somaSaldosHoje += Number(t.saldo ?? t.valor_original) || 0
                })
                setAReceberHojeTotal(somaSaldosHoje)
                setAReceberHojeCount(titulosHoje.length)

                // A receber vencido: status in ('Aberto', 'Parcial') && data_vencimento < hojeIso
                const titulosVencidos = await pb.collection('contas_receber').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && (status = 'Aberto' || status = 'Parcial') && data_vencimento < '${hojeIso}'`,
                  fields: 'saldo,valor_original',
                })
                let somaSaldosVenc = 0
                titulosVencidos.forEach((t: any) => {
                  somaSaldosVenc += Number(t.saldo ?? t.valor_original) || 0
                })
                setAReceberVencidoTotal(somaSaldosVenc)
                setAReceberVencidoCount(titulosVencidos.length)
              } catch (err) {
                console.warn('Erro ao carregar indicadores de contas a receber:', err)
                setAReceberHojeTotal(0)
                setAReceberHojeCount(0)
                setAReceberVencidoTotal(0)
                setAReceberVencidoCount(0)
              }
            })(),
          )
        }

        // Saldo total das contas financeiras da empresa ativa
        if (podeVerFinanceiroBancos) {
          promisesContagens.push(
            (async () => {
              try {
                const contas = await pb.collection('contas_financeiras').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true`,
                  fields: 'saldo_atual',
                })
                const saldoTotal = contas.reduce(
                  (acc: number, c: any) => acc + (Number(c.saldo_atual) || 0),
                  0,
                )
                setSaldoTotalContas(saldoTotal)
                setTotalContasCadastradas(contas.length)
              } catch (err) {
                console.warn('Erro ao carregar saldo de contas financeiras:', err)
                setSaldoTotalContas(0)
                setTotalContasCadastradas(0)
              }
            })(),
          )

          // Mini gráfico do fluxo de caixa dos próximos 30 dias (consumir apurarFluxoCaixa)
          promisesContagens.push(
            (async () => {
              try {
                setCarregandoFluxo(true)
                const hojeD = new Date()
                const dataInicioFluxo = hojeD.toISOString().slice(0, 10)
                const dataFimFluxo = new Date(hojeD.getTime() + 30 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .slice(0, 10)

                const resultadoFluxo = await apurarFluxoCaixa({
                  empresaId: empresaAtiva.id,
                  dataInicio: dataInicioFluxo,
                  dataFim: dataFimFluxo,
                  agrupamento: 'dia',
                  incluirVencidos: true,
                })

                setDadosFluxo30Dias(resultadoFluxo.periodos || [])
              } catch (err) {
                console.warn('Erro ao carregar fluxo de caixa 30 dias:', err)
                setDadosFluxo30Dias([])
              } finally {
                setCarregandoFluxo(false)
              }
            })(),
          )
        }

        // Indicadores Fiscais (Etapa 6)
        if (podeVerFiscal) {
          promisesContagens.push(
            (async () => {
              try {
                // 1. Notas Rejeitadas da empresa ativa
                const rejRes = await pb.collection('documentos_fiscais').getList(1, 1, {
                  filter: `empresa_id = '${empresaAtiva.id}' && status = 'Rejeitada'`,
                })
                setNotasRejeitadasCount(rejRes.totalItems)

                // 2. Notas Processando da empresa ativa
                const procRes = await pb.collection('documentos_fiscais').getList(1, 1, {
                  filter: `empresa_id = '${empresaAtiva.id}' && status = 'Processando'`,
                })
                setNotasProcessandoCount(procRes.totalItems)

                // 3. Notas Emitidas Hoje (Autorizadas criadas hoje na empresa ativa)
                const emitHojeRes = await pb.collection('documentos_fiscais').getList(1, 1, {
                  filter: `empresa_id = '${empresaAtiva.id}' && (status = 'Autorizada' || status = 'Cancelada') && (created >= '${hojeIso} 00:00:00' || created >= '${hojeIso}T00:00:00.000Z')`,
                })
                setNotasEmitidasHojeCount(emitHojeRes.totalItems)

                // 4. Configuração de emissão fiscal (Certificado e Ambiente)
                const cfgList = await pb.collection('config_emissao_fiscal').getList(1, 1, {
                  filter: `empresa_id = '${empresaAtiva.id}'`,
                })
                if (cfgList.items.length > 0) {
                  const cfgFiscal = cfgList.items[0]
                  const amb = cfgFiscal.ambiente || 'Homologação'
                  setAmbienteHomologacaoAtivo(amb === 'Homologação')

                  const dtVenc = cfgFiscal.data_vencimento_certificado
                  if (dtVenc) {
                    setDataVencimentoCertificadoStr(dtVenc)
                    const dataVenc = new Date(dtVenc)
                    const agora = new Date()
                    const diffTime = dataVenc.getTime() - agora.getTime()
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                    setDiasVencimentoCertificado(diffDays)
                  } else {
                    setDiasVencimentoCertificado(null)
                    setDataVencimentoCertificadoStr(null)
                  }
                } else {
                  setAmbienteHomologacaoAtivo(false)
                  setDiasVencimentoCertificado(null)
                  setDataVencimentoCertificadoStr(null)
                }
              } catch (errFiscal) {
                console.warn('Erro ao carregar indicadores fiscais:', errFiscal)
                setNotasRejeitadasCount(0)
                setNotasProcessandoCount(0)
                setNotasEmitidasHojeCount(0)
                setDiasVencimentoCertificado(null)
                setDataVencimentoCertificadoStr(null)
                setAmbienteHomologacaoAtivo(false)
              }
            })(),
          )

          // 5. SPED do mês anterior por empresa com obrigado_efd_icms_ipi (Prompt 7.6b - Item 2)
          promisesContagens.push(
            (async () => {
              try {
                // Cálculo do mês anterior no horário de Brasília (America/Sao_Paulo)
                const agora = new Date()
                const formatoBrasilia = new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Sao_Paulo',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }).format(agora)
                const [anoBsb, mesBsb] = formatoBrasilia.split('-').map(Number)
                const dMesAnt = new Date(Date.UTC(anoBsb, mesBsb - 2, 1))
                const anoMesAnt = dMesAnt.getUTCFullYear()
                const mesMesAnt = String(dMesAnt.getUTCMonth() + 1).padStart(2, '0')
                const periodoMesAnterior = `${anoMesAnt}-${mesMesAnt}`

                // Buscar empresas ativas com obrigado_efd_icms_ipi
                const todasEmpresas = await listarEmpresasAtivas()
                const empresasObrigadas = todasEmpresas.filter((e) =>
                  Boolean(e.obrigado_efd_icms_ipi),
                )

                if (empresasObrigadas.length === 0) {
                  setStatusSpedEmpresas([])
                  return
                }

                const listaStatus = await Promise.all(
                  empresasObrigadas.map(async (emp) => {
                    try {
                      const resSped = await pb.collection('sped_arquivos').getList(1, 1, {
                        filter: `empresa_id = '${emp.id}' && modo = 'Oficial' && periodo = '${periodoMesAnterior}'`,
                        sort: '-created',
                      })

                      if (resSped.items.length === 0) {
                        return {
                          empresa: emp,
                          periodo: periodoMesAnterior,
                          statusFormatado: 'não gerado' as const,
                        }
                      }

                      const statusRegistro = resSped.items[0].status
                      let statusFmt: 'não gerado' | 'gerado com erros' | 'gerado' | 'entregue' =
                        'não gerado'
                      if (statusRegistro === 'Entregue') {
                        statusFmt = 'entregue'
                      } else if (statusRegistro === 'Gerado com erros') {
                        statusFmt = 'gerado com erros'
                      } else if (statusRegistro === 'Gerado') {
                        statusFmt = 'gerado'
                      } else {
                        statusFmt = 'não gerado'
                      }

                      return {
                        empresa: emp,
                        periodo: periodoMesAnterior,
                        statusFormatado: statusFmt,
                      }
                    } catch (errEmp) {
                      console.warn(`Erro ao consultar SPED para empresa ${emp.id}:`, errEmp)
                      return {
                        empresa: emp,
                        periodo: periodoMesAnterior,
                        statusFormatado: 'não gerado' as const,
                      }
                    }
                  }),
                )

                setStatusSpedEmpresas(listaStatus)
              } catch (errSped) {
                console.warn('Erro ao calcular status do SPED do mês anterior:', errSped)
                setStatusSpedEmpresas([])
              }
            })(),
          )
        }

        // Indicadores de Vendas e PDV (Etapa 5)
        if (podeVerVendas) {
          promisesContagens.push(
            (async () => {
              try {
                setCarregandoVendas(true)
                const dHoje = new Date()
                const hojeStr = dHoje.toISOString().slice(0, 10)

                // 1. Vendas de Hoje
                const vendasHojeRes = await pb.collection('vendas').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && status = 'Finalizada' && tipo != 'Devolução' && data_emissao = '${hojeStr}'`,
                  fields: 'valor_total',
                })
                const qtdHoje = vendasHojeRes.length
                const valHoje = vendasHojeRes.reduce(
                  (acc, v: any) => acc + (Number(v.valor_total) || 0),
                  0,
                )
                setVendasHojeQtd(qtdHoje)
                setVendasHojeValor(valHoje)
                setTicketMedioHoje(qtdHoje > 0 ? Number((valHoje / qtdHoje).toFixed(2)) : 0)

                // 2. Caixas abertos da empresa ativa
                const caixasRes = await pb.collection('caixa_sessoes').getList(1, 1, {
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && status = 'Aberta'`,
                })
                setCaixasAbertosCount(caixasRes.totalItems)

                // 3. Orçamentos a vencer em até 2 dias (status = 'Orçamento' e data_validade <= hoje + 2dias e >= hoje)
                const dMais2 = new Date(dHoje.getTime() + 2 * 24 * 60 * 60 * 1000)
                const dMais2Str = dMais2.toISOString().slice(0, 10)
                const orcsRes = await pb.collection('vendas').getList(1, 1, {
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && tipo = 'Orçamento' && status = 'Orçamento' && data_validade >= '${hojeStr}' && data_validade <= '${dMais2Str}'`,
                })
                setOrcamentosVencendoCount(orcsRes.totalItems)

                // 4. Vendas do mês atual x mês anterior
                const pDiaMesAtual = new Date(dHoje.getFullYear(), dHoje.getMonth(), 1)
                  .toISOString()
                  .slice(0, 10)
                const uDiaMesAtual = new Date(dHoje.getFullYear(), dHoje.getMonth() + 1, 0)
                  .toISOString()
                  .slice(0, 10)

                const pDiaMesAnt = new Date(dHoje.getFullYear(), dHoje.getMonth() - 1, 1)
                  .toISOString()
                  .slice(0, 10)
                const uDiaMesAnt = new Date(dHoje.getFullYear(), dHoje.getMonth(), 0)
                  .toISOString()
                  .slice(0, 10)

                const [vendasMesAt, vendasMesAnt] = await Promise.all([
                  pb.collection('vendas').getFullList({
                    filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && status = 'Finalizada' && tipo != 'Devolução' && data_emissao >= '${pDiaMesAtual}' && data_emissao <= '${uDiaMesAtual}'`,
                    fields: 'valor_total',
                  }),
                  pb.collection('vendas').getFullList({
                    filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && status = 'Finalizada' && tipo != 'Devolução' && data_emissao >= '${pDiaMesAnt}' && data_emissao <= '${uDiaMesAnt}'`,
                    fields: 'valor_total',
                  }),
                ])

                const totMesAt = vendasMesAt.reduce(
                  (acc, v: any) => acc + (Number(v.valor_total) || 0),
                  0,
                )
                const totMesAnt = vendasMesAnt.reduce(
                  (acc, v: any) => acc + (Number(v.valor_total) || 0),
                  0,
                )
                setVendasMesAtualTotal(totMesAt)
                setVendasMesAnteriorTotal(totMesAnt)

                // 5. Gráfico de vendas dos últimos 30 dias
                const dMenos30 = new Date(dHoje.getTime() - 29 * 24 * 60 * 60 * 1000)
                const dMenos30Str = dMenos30.toISOString().slice(0, 10)

                const vendas30 = await pb.collection('vendas').getFullList({
                  filter: `empresa_id = '${empresaAtiva.id}' && ativo = true && status = 'Finalizada' && tipo != 'Devolução' && data_emissao >= '${dMenos30Str}' && data_emissao <= '${hojeStr}'`,
                  fields: 'data_emissao,valor_total',
                })

                const mapa30 = new Map<string, number>()
                // Inicializa os 30 dias com 0
                for (let i = 0; i < 30; i++) {
                  const d = new Date(dMenos30.getTime() + i * 24 * 60 * 60 * 1000)
                  const diaIso = d.toISOString().slice(0, 10)
                  mapa30.set(diaIso, 0)
                }

                vendas30.forEach((v: any) => {
                  const dt = (v.data_emissao || '').slice(0, 10)
                  if (mapa30.has(dt)) {
                    mapa30.set(dt, (mapa30.get(dt) || 0) + (Number(v.valor_total) || 0))
                  }
                })

                const listaGrafico = Array.from(mapa30.entries()).map(([dia, valor]) => ({
                  dia,
                  rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`,
                  valor: Number(valor.toFixed(2)),
                }))

                setGraficoVendas30Dias(listaGrafico)
              } catch (err) {
                console.warn('Erro ao carregar indicadores de vendas no painel:', err)
              } finally {
                setCarregandoVendas(false)
              }
            })(),
          )
        }
      }

      // 2. Carregar últimos registros para compor os 10 últimos cadastros
      const promisesUltimos: Promise<
        {
          tipo: 'cliente' | 'fornecedor' | 'produto'
          tipoLabel: string
          id: string
          codigo: string | number
          identificacao: string
          criadoEm: string
          createdDate: Date
          urlDetalhe: string
        }[]
      >[] = []

      if (podeVerClientes) {
        promisesUltimos.push(
          pb
            .collection('clientes')
            .getList(1, 10, { sort: '-created' })
            .then((res) =>
              res.items.map((c) => ({
                id: c.id,
                tipo: 'cliente' as const,
                tipoLabel: 'Cliente',
                codigo: c.codigo || '-',
                identificacao: (c.nome_razao_social || c.nome_fantasia || 'Sem nome') as string,
                criadoEm: c.created,
                createdDate: new Date(c.created),
                urlDetalhe: `/cadastros/clientes/${c.id}/editar`,
              })),
            )
            .catch(() => []),
        )
      }

      if (podeVerFornecedores) {
        promisesUltimos.push(
          pb
            .collection('fornecedores')
            .getList(1, 10, { sort: '-created' })
            .then((res) =>
              res.items.map((f) => ({
                id: f.id,
                tipo: 'fornecedor' as const,
                tipoLabel: 'Fornecedor',
                codigo: f.codigo || '-',
                identificacao: (f.razao_social || f.nome_fantasia || 'Sem nome') as string,
                criadoEm: f.created,
                createdDate: new Date(f.created),
                urlDetalhe: `/cadastros/fornecedores/${f.id}/editar`,
              })),
            )
            .catch(() => []),
        )
      }

      if (podeVerProdutos) {
        promisesUltimos.push(
          pb
            .collection('produtos')
            .getList(1, 10, { sort: '-created' })
            .then((res) =>
              res.items.map((p) => ({
                id: p.id,
                tipo: 'produto' as const,
                tipoLabel: 'Produto',
                codigo: p.codigo || '-',
                identificacao: (p.descricao || 'Sem descrição') as string,
                criadoEm: p.created,
                createdDate: new Date(p.created),
                urlDetalhe: `/cadastros/produtos/${p.id}/editar`,
              })),
            )
            .catch(() => []),
        )
      }

      // 3. Verificar Pendências de Configuração
      const peds: PendenciaConfiguracao[] = []

      // Checagem de Empresas (Contador e IE)
      if (podeVerEmpresas) {
        try {
          const emp = empresaAtiva
          if (emp) {
            // Empresa sem dados do contador
            const semContador =
              !emp.contador_nome ||
              !emp.contador_cpf ||
              !emp.contador_crc ||
              emp.contador_nome.trim() === ''
            if (semContador) {
              peds.push({
                id: 'empresa_sem_contador',
                titulo: 'Empresa sem dados da contabilidade',
                descricao: `A empresa ativa (${emp.nome_fantasia || emp.razao_social}) não possui os dados do contador preenchidos na aba Contabilidade.`,
                link: `/cadastros/empresas/${emp.id}/editar`,
                modulo: 'empresas',
                gravidade: 'alta',
              })
            }

            // Empresa sem Inscrição Estadual
            const semIe = !emp.inscricao_estadual || emp.inscricao_estadual.trim() === ''
            if (semIe) {
              peds.push({
                id: 'empresa_sem_ie',
                titulo: 'Empresa sem Inscrição Estadual',
                descricao: `A Inscrição Estadual da empresa ativa (${emp.nome_fantasia || emp.razao_social}) não foi informada.`,
                link: `/cadastros/empresas/${emp.id}/editar`,
                modulo: 'empresas',
                gravidade: 'alta',
              })
            }
          }
        } catch (e) {
          console.warn('Erro ao avaliar pendências de empresas:', e)
        }
      }

      // Checagens de Tabelas Fiscais (NCM vazia, CEST vazia, Perfis tributários vazios)
      if (podeVerTabelasFiscais) {
        try {
          const [ncmRes, cestRes, perfisRes] = await Promise.all([
            pb.collection('ncm').getList(1, 1),
            pb.collection('cest').getList(1, 1),
            pb.collection('perfis_tributarios').getList(1, 1),
          ])

          if (ncmRes.totalItems === 0) {
            peds.push({
              id: 'tabela_ncm_vazia',
              titulo: 'Tabela de NCM vazia',
              descricao:
                'Nenhum código NCM cadastrado. O NCM é obrigatório para cadastrar produtos e emitir notas.',
              link: '/cadastros/tabelas-fiscais/ncm',
              modulo: 'tabelas_fiscais',
              gravidade: 'alta',
            })
          }

          if (cestRes.totalItems === 0) {
            peds.push({
              id: 'tabela_cest_vazia',
              titulo: 'Tabela de CEST vazia',
              descricao:
                'Nenhum CEST cadastrado. Necessário para operações com mercadorias sujeitas à Substituição Tributária (ICMS-ST).',
              link: '/cadastros/tabelas-fiscais/cest',
              modulo: 'tabelas_fiscais',
              gravidade: 'media',
            })
          }

          if (perfisRes.totalItems === 0) {
            peds.push({
              id: 'nenhum_perfil_tributario',
              titulo: 'Nenhum perfil tributário cadastrado',
              descricao:
                'Crie perfis tributários com regras de ICMS, PIS e COFINS para automatizar o fiscal dos produtos.',
              link: '/cadastros/tabelas-fiscais/perfis',
              modulo: 'tabelas_fiscais',
              gravidade: 'alta',
            })
          }
        } catch (e) {
          console.warn('Erro ao avaliar pendências tributárias:', e)
        }
      }

      setPendencias(peds)

      // Aguarda contagens
      await Promise.all(promisesContagens)

      // Aguarda e junta últimos cadastros
      const resultadosUltimos = await Promise.all(promisesUltimos)
      const todosUltimos = resultadosUltimos.flat()
      todosUltimos.sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime())
      setUltimosCadastros(todosUltimos.slice(0, 10))
    } catch (err) {
      console.error('Erro ao montar dados do painel:', err)
    } finally {
      setCarregando(false)
    }
  }, [
    podeVerClientes,
    podeVerFornecedores,
    podeVerProdutos,
    podeVerUsuarios,
    podeVerEmpresas,
    podeVerTabelasFiscais,
    podeVerEstoque,
    podeVerCompras,
    podeVerNotasEntrada,
    podeVerFinanceiroPagar,
    podeVerFinanceiroReceber,
    podeVerFinanceiroBancos,
    podeVerVendas,
    podeVerFiscal,
    empresaAtiva,
  ])

  useEffect(() => {
    carregarDadosPainel()
  }, [carregarDadosPainel])

  const nomeExibicao = user?.name || 'Administrador'
  const temAlgumaVisualizacao =
    podeVerClientes ||
    podeVerFornecedores ||
    podeVerProdutos ||
    podeVerEstoque ||
    podeVerCompras ||
    podeVerNotasEntrada ||
    podeVerUsuarios ||
    podeVerEmpresas ||
    podeVerTabelasFiscais ||
    podeVerFinanceiroPagar ||
    podeVerFinanceiroReceber ||
    podeVerFinanceiroBancos

  const formatarDataHora = (dataIso: string) => {
    try {
      const d = new Date(dataIso)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dataIso
    }
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val)
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel Geral</h1>
            <Badge variant="outline" className="text-xs bg-slate-50 border-slate-200 font-normal">
              {config?.nome_sistema || 'ERP Gestão Comercial'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Olá, <strong className="text-slate-800">{nomeExibicao}</strong>. Acompanhe os principais
            indicadores e pendências cadastrais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {empresaAtiva && (
            <div className="hidden lg:flex items-center gap-2 text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
              <Building size={14} className="text-primary flex-shrink-0" />
              <span className="font-medium truncate max-w-[200px]">
                {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => carregarDadosPainel()}
            disabled={carregando}
            className="gap-2 text-xs h-9 border-slate-200 text-slate-700 hover:text-slate-900 shadow-xs"
            title="Recarregar dados do painel"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin text-primary' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cartões de Indicadores Principais */}
      {temAlgumaVisualizacao ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Clientes Ativos */}
          {podeVerClientes && (
            <Link to="/cadastros/clientes" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Clientes Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <UserCheck size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalClientesAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">cadastros ativos no sistema</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Total Fornecedores Ativos */}
          {podeVerFornecedores && (
            <Link to="/cadastros/fornecedores" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Fornecedores Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Truck size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalFornecedoresAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">parceiros comerciais</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Total Produtos Ativos */}
          {podeVerProdutos && (
            <Link to="/cadastros/produtos" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Produtos Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Box size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalProdutosAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">itens no catálogo</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Produtos com Fiscal Incompleto (Clicável -> /cadastros/produtos/conferencia) */}
          {podeVerProdutos && (
            <Link
              to="/cadastros/produtos/conferencia"
              className="group block focus:outline-none"
              title="Clique para abrir a tela de Conferência Fiscal de Produtos"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  totalProdutosFiscalIncompleto > 0
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-800">Fiscal Incompleto</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <FileCheck size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-amber-700 group-hover:text-amber-900 transition-colors flex items-center gap-2">
                      {carregando ? '—' : totalProdutosFiscalIncompleto}
                      {totalProdutosFiscalIncompleto > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                          Revisar
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-amber-700/80 underline decoration-amber-300">
                      Abrir conferência fiscal →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Total Usuários Ativos */}
          {podeVerUsuarios && (
            <Link to="/cadastros/usuarios" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Usuários Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Users size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalUsuariosAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">operadores do sistema</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      ) : (
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-6 text-center text-slate-500 text-sm">
            Você não possui permissão para visualizar os indicadores gerais do painel.
          </CardContent>
        </Card>
      )}

      {/* SEÇÃO ESTOQUE (Etapa 2) — Respeita permissão de estoque */}
      {podeVerEstoque && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-t border-slate-200 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <Box className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Visão Geral do Estoque
                </h2>
                {empresaAtiva && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Valoração, reposição, monitoramento de validade, transferências e inventários da
                empresa ativa.
              </p>
            </div>

            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
              <Link to="/estoque/posicao">
                Ver Posição Completa
                <ArrowRight size={13} />
              </Link>
            </Button>
          </div>

          {/* Cartões de Estoque */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Valor Total do Estoque */}
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Valor Total do Estoque</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <DollarSign size={18} />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xl font-bold tracking-tight text-slate-900 font-mono">
                    {carregando ? '—' : formatarMoeda(valorTotalEstoque)}
                  </div>
                  <span className="text-[11px] text-slate-400">custo médio ponderado</span>
                </div>
              </CardContent>
            </Card>

            {/* Produtos Abaixo do Mínimo (Clicável) */}
            <Link
              to="/estoque/posicao?situacao=abaixo_minimo"
              className="group block focus:outline-none"
              title="Filtrar posição de estoque por produtos abaixo do mínimo"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  produtosAbaixoMinimoCount > 0
                    ? 'border-rose-200 bg-rose-50/20'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-rose-800">Abaixo do Mínimo</span>
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                      <TrendingDown size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-rose-700 group-hover:text-rose-900 transition-colors flex items-center gap-2">
                      {carregando ? '—' : produtosAbaixoMinimoCount}
                      {produtosAbaixoMinimoCount > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-200 text-rose-900">
                          Repor
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-rose-700/80 underline decoration-rose-300">
                      Abrir Posição filtrada →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Lotes Vencidos e a Vencer (Clicável) */}
            <Link
              to="/estoque/lotes"
              className="group block focus:outline-none"
              title="Clique para abrir a gestão de lotes e validade"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  lotesVencidosCount > 0
                    ? 'border-rose-300 bg-rose-50/30 ring-1 ring-rose-200'
                    : lotesAVencerCount > 0
                      ? 'border-amber-200 bg-amber-50/20'
                      : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Lotes & Validade</span>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        lotesVencidosCount > 0
                          ? 'bg-rose-100 text-rose-700'
                          : lotesAVencerCount > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      <CalendarClock size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tracking-tight text-slate-900">
                        {carregando ? '—' : lotesVencidosCount}
                      </span>
                      <span className="text-xs text-rose-600 font-semibold">vencidos</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-base font-bold text-amber-600">
                        {carregando ? '—' : lotesAVencerCount}
                      </span>
                      <span className="text-[11px] text-amber-600">a vencer (30d)</span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Abrir lotes com saldo →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Transferências a Receber (Clicável) */}
            <Link
              to="/estoque/transferencias"
              className="group block focus:outline-none"
              title="Clique para abrir as transferências entre filiais"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  totalTransferenciasReceber > 0
                    ? 'border-amber-300 bg-amber-50/30 ring-1 ring-amber-200'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">
                      Transferências a Receber
                    </span>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        totalTransferenciasReceber > 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      <ArrowLeftRight size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
                      {carregando ? '—' : totalTransferenciasReceber}
                      {totalTransferenciasReceber > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 animate-pulse">
                          Chegando
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {totalTransferenciasReceber > 0
                        ? 'aguardando conferência'
                        : 'nenhuma em trânsito'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Inventários Abertos (Clicável) */}
            <Link
              to="/estoque/inventarios"
              className="group block focus:outline-none"
              title="Clique para acompanhar inventários em andamento"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  inventariosAbertosCount > 0
                    ? 'border-blue-200 bg-blue-50/20'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Inventários Abertos</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <ClipboardList size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
                      {carregando ? '—' : inventariosAbertosCount}
                      {inventariosAbertosCount > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          Em contagem
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {inventariosAbertosCount > 0
                        ? 'contagens em andamento'
                        : 'nenhum inventário aberto'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* SEÇÃO VENDAS E PDV (Etapa 5) — Respeita permissão de vendas ou pdv */}
      {podeVerVendas && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-t border-slate-200 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Visão Geral de Vendas e PDV
                </h2>
                {empresaAtiva && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vendas de hoje, ticket médio, caixas em operação, orçamentos a vencer e comparação
                mensal.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Link to="/vendas/pedidos">
                  Orçamentos e Pedidos
                  <ArrowRight size={13} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Link to="/vendas/consultas">
                  Consultas
                  <ArrowRight size={13} />
                </Link>
              </Button>
            </div>
          </div>

          {/* Cartões da Seção de Vendas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* 1. Vendas de Hoje (Valor e Quantidade) */}
            <Link
              to={`/vendas/consultas`}
              className="group block focus:outline-none"
              title="Ver vendas do dia de hoje"
            >
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Vendas de Hoje</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <DollarSign size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors font-mono">
                      {carregandoVendas ? '—' : formatarMoeda(vendasHojeValor)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700">{vendasHojeQtd}</span>
                      <span>{vendasHojeQtd === 1 ? 'venda finalizada' : 'vendas finalizadas'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* 2. Ticket Médio do Dia */}
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Ticket Médio Hoje</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <TrendingUp size={18} />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xl font-bold tracking-tight text-slate-900 font-mono">
                    {carregandoVendas ? '—' : formatarMoeda(ticketMedioHoje)}
                  </div>
                  <span className="text-[11px] text-slate-400">por venda faturada</span>
                </div>
              </CardContent>
            </Card>

            {/* 3. Caixas Abertos */}
            <Link
              to="/vendas/caixa"
              className="group block focus:outline-none"
              title="Acompanhar operadores e caixas"
            >
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Caixas Abertos</span>
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                      <CreditCard size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
                      {carregandoVendas ? '—' : caixasAbertosCount}
                      {caixasAbertosCount > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Em operação
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {caixasAbertosCount > 0
                        ? 'terminais com sessões ativas'
                        : 'nenhum caixa aberto no momento'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* 4. Orçamentos a Vencer em 2 Dias */}
            <Link
              to="/vendas/pedidos"
              className="group block focus:outline-none"
              title="Acompanhar propostas comerciais prestes a vencer"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  orcamentosVencendoCount > 0
                    ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-200'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-800">Orçamentos a Vencer</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <CalendarClock size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-amber-700 group-hover:text-amber-900 transition-colors flex items-center gap-2">
                      {carregandoVendas ? '—' : orcamentosVencendoCount}
                      {orcamentosVencendoCount > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                          Cobrar
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-amber-700/80">
                      {orcamentosVencendoCount > 0
                        ? 'vencem em até 2 dias →'
                        : 'nenhuma proposta a expirar'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* 5. Vendas Mês Atual x Mês Anterior */}
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Mês Atual x Anterior</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Layers size={18} />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-lg font-bold tracking-tight text-indigo-900 font-mono">
                    {carregandoVendas ? '—' : formatarMoeda(vendasMesAtualTotal)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Ant:{' '}
                    <span className="font-mono text-slate-600">
                      {formatarMoeda(vendasMesAnteriorTotal)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico de Vendas dos Últimos 30 Dias */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-2 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <LineChartIcon className="w-4 h-4 text-indigo-600" />
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Faturamento Diário de Vendas (Últimos 30 dias)
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Evolução do faturamento líquido de vendas finalizadas na empresa ativa.
                </CardDescription>
              </div>

              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-indigo-600">
                <Link to="/vendas/consultas">
                  Ver relatório completo
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            </CardHeader>

            <CardContent className="pt-4 pb-2">
              {carregandoVendas ? (
                <div className="h-56 flex flex-col items-center justify-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary mb-2" />
                  Carregando vendas dos últimos 30 dias...
                </div>
              ) : graficoVendas30Dias.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-500">
                  Nenhuma venda realizada nos últimos 30 dias.
                </div>
              ) : (
                <div className="h-56 w-full">
                  <ChartContainer
                    config={
                      {
                        valor: {
                          label: 'Vendas (R$)',
                          color: '#4f46e5',
                        },
                      } satisfies ChartConfig
                    }
                    className="h-full w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={graficoVendas30Dias}
                        margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                        <XAxis
                          dataKey="rotulo"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={6}
                          interval={2}
                          className="text-[10px]"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                          className="text-[10px]"
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => (
                                <div className="flex items-center justify-between gap-4 font-mono text-xs">
                                  <span>Faturamento:</span>
                                  <span className="font-bold text-indigo-600">
                                    R${' '}
                                    {Number(value || 0).toLocaleString('pt-BR', {
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Bar
                          dataKey="valor"
                          name="Vendas"
                          fill="#6366f1"
                          radius={[3, 3, 0, 0]}
                          maxBarSize={18}
                        />
                        <Line
                          type="monotone"
                          dataKey="valor"
                          name="Tendência"
                          stroke="#312e81"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SEÇÃO FISCAL (Etapa 6) — Respeita permissão fiscal (notas_saida ou tabelas_fiscais) */}
      {podeVerFiscal && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-t border-slate-200 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Visão Geral Fiscal
                </h2>
                {empresaAtiva && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitoramento de emissões, notas em processamento, rejeições e validade do
                certificado digital.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Link to="/fiscal/documentos">
                  Monitor de Documentos
                  <ArrowRight size={13} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Link to="/fiscal/exportar-xmls">
                  Exportar XMLs
                  <ArrowRight size={13} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Link to="/fiscal/sped">
                  SPED Fiscal
                  <ArrowRight size={13} />
                </Link>
              </Button>
            </div>
          </div>

          {/* Aviso vermelho quando ambiente de homologação estiver ativo */}
          {ambienteHomologacaoAtivo && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3.5 flex items-center justify-between gap-3 text-red-950 shadow-xs animate-in fade-in-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-red-700">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-red-900 uppercase tracking-wide flex items-center gap-2">
                    Ambiente de Homologação Ativo
                    <Badge
                      variant="destructive"
                      className="text-[10px] uppercase font-bold py-0 h-4"
                    >
                      Sem Valor Fiscal
                    </Badge>
                  </h4>
                  <p className="text-xs text-red-700 leading-relaxed mt-0.5">
                    As notas fiscais (NF-e e NFC-e) estão sendo transmitidas para o ambiente de
                    testes da SEFAZ. Nenhuma nota emitida neste modo tem validade jurídica ou fiscal
                    real.
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 text-xs bg-white text-red-800 border-red-300 hover:bg-red-100 hover:text-red-900 flex-shrink-0"
              >
                <Link to="/fiscal/configuracao-emissao">Alterar para Produção</Link>
              </Button>
            </div>
          )}

          {/* Cartões Fiscais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Notas Rejeitadas (Clicável, leva ao monitor filtrado por Rejeitadas) */}
            <Link
              to="/fiscal/documentos?status=Rejeitada"
              className="group block focus:outline-none"
              title="Abrir monitor de documentos fiscais filtrado em notas Rejeitadas"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  notasRejeitadasCount > 0
                    ? 'border-rose-300 bg-rose-50/25 ring-1 ring-rose-200'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-rose-800">Notas Rejeitadas</span>
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                      <FileX2 size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-rose-700 group-hover:text-rose-900 transition-colors flex items-center gap-2">
                      {carregando ? '—' : notasRejeitadasCount}
                      {notasRejeitadasCount > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-200 text-rose-900">
                          Atenção
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-rose-700/80 underline decoration-rose-300">
                      {notasRejeitadasCount > 0
                        ? 'Ver notas rejeitadas na SEFAZ →'
                        : 'Nenhuma nota rejeitada'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* 2. Notas Processando (Clicável, leva ao monitor filtrado por Processando) */}
            <Link
              to="/fiscal/documentos?status=Processando"
              className="group block focus:outline-none"
              title="Abrir monitor de documentos fiscais filtrado em notas em Processamento"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  notasProcessandoCount > 0
                    ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-200'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-800">Notas Processando</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <FileClock size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-amber-700 group-hover:text-amber-900 transition-colors flex items-center gap-2">
                      {carregando ? '—' : notasProcessandoCount}
                      {notasProcessandoCount > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 animate-pulse">
                          Aguardando
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-amber-700/80">
                      {notasProcessandoCount > 0
                        ? 'Aguardando retorno da SEFAZ →'
                        : 'Nenhuma nota na fila'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* 3. Notas Emitidas Hoje */}
            <Link
              to="/fiscal/documentos"
              className="group block focus:outline-none"
              title="Ver documentos fiscais autorizados hoje"
            >
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Notas Emitidas Hoje</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <FileCheck2 size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
                      {carregando ? '—' : notasEmitidasHojeCount}
                    </div>
                    <span className="text-[11px] text-slate-400">autorizadas no dia atual →</span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* 4. Certificado Digital */}
            <Link
              to="/fiscal/configuracao-emissao"
              className="group block focus:outline-none"
              title="Ver validade do Certificado Digital na Configuração de Emissão"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  diasVencimentoCertificado !== null && diasVencimentoCertificado <= 30
                    ? diasVencimentoCertificado <= 0
                      ? 'border-red-300 bg-red-50/25 ring-1 ring-red-200'
                      : 'border-amber-300 bg-amber-50/25 ring-1 ring-amber-200'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Certificado Digital</span>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        diasVencimentoCertificado !== null && diasVencimentoCertificado <= 30
                          ? diasVencimentoCertificado <= 0
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                          : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      <Award size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    {diasVencimentoCertificado === null ? (
                      <div>
                        <div className="text-base font-bold text-slate-600">Não configurado</div>
                        <span className="text-[11px] text-slate-400">configurar A1 na Focus →</span>
                      </div>
                    ) : diasVencimentoCertificado <= 0 ? (
                      <div>
                        <div className="text-xl font-bold text-red-700 flex items-center gap-1.5">
                          Vencido
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-900">
                            Expirado
                          </span>
                        </div>
                        <span className="text-[11px] text-red-700/80">
                          venceu em{' '}
                          {dataVencimentoCertificadoStr
                            ?.substring(0, 10)
                            .split('-')
                            .reverse()
                            .join('/')}{' '}
                          →
                        </span>
                      </div>
                    ) : (
                      <div>
                        <div
                          className={`text-2xl font-bold tracking-tight flex items-center gap-2 ${
                            diasVencimentoCertificado <= 30
                              ? 'text-amber-700'
                              : 'text-slate-900 group-hover:text-primary'
                          }`}
                        >
                          {diasVencimentoCertificado}{' '}
                          {diasVencimentoCertificado === 1 ? 'dia' : 'dias'}
                          {diasVencimentoCertificado <= 30 && (
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                              Vencendo
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {diasVencimentoCertificado <= 30
                            ? 'renovar com urgência →'
                            : `válido até ${dataVencimentoCertificadoStr?.substring(0, 10).split('-').reverse().join('/')}`}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Cards "SPED do mês anterior" para cada empresa obrigada à EFD (Prompt 7.6b - Item 2) */}
          {statusSpedEmpresas.length > 0 && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-700">
                    Obrigatoriedade EFD ICMS/IPI — SPED do Mês Anterior
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {statusSpedEmpresas[0]?.periodo} (horário de Brasília)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statusSpedEmpresas.map(({ empresa: emp, periodo: per, statusFormatado }) => {
                  const nomeEmpresa = emp.nome_fantasia || emp.razao_social

                  let estiloCard = 'hover:border-slate-300'
                  let badgeStatus = (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-slate-100 text-slate-700 border-slate-300"
                    >
                      não gerado
                    </Badge>
                  )
                  let textoDesc = 'arquivo do mês anterior não gerado'
                  let iconeCor = 'bg-slate-100 text-slate-600'

                  if (statusFormatado === 'entregue') {
                    estiloCard = 'border-emerald-300 bg-emerald-50/20 ring-1 ring-emerald-200'
                    badgeStatus = (
                      <Badge className="bg-blue-600 text-white text-[10px] hover:bg-blue-600 font-semibold">
                        entregue
                      </Badge>
                    )
                    textoDesc = 'transmitido com recibo no PVA'
                    iconeCor = 'bg-blue-100 text-blue-700'
                  } else if (statusFormatado === 'gerado') {
                    estiloCard = 'border-blue-300 bg-blue-50/20 ring-1 ring-blue-200'
                    badgeStatus = (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] hover:bg-emerald-100 font-semibold">
                        gerado
                      </Badge>
                    )
                    textoDesc = 'gerado e pronto para o PVA'
                    iconeCor = 'bg-emerald-100 text-emerald-700'
                  } else if (statusFormatado === 'gerado com erros') {
                    estiloCard = 'border-amber-300 bg-amber-50/25 ring-1 ring-amber-200'
                    badgeStatus = (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] hover:bg-amber-100 font-semibold">
                        gerado com erros
                      </Badge>
                    )
                    textoDesc = 'requer revisão de consistências'
                    iconeCor = 'bg-amber-100 text-amber-700'
                  } else {
                    estiloCard = 'border-rose-200 bg-rose-50/20'
                    badgeStatus = (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-rose-100 text-rose-800 border-rose-300 font-semibold"
                      >
                        não gerado
                      </Badge>
                    )
                    textoDesc = 'pendente de geração oficial'
                    iconeCor = 'bg-rose-100 text-rose-700'
                  }

                  return (
                    <Link
                      key={emp.id}
                      to="/fiscal/sped"
                      className="group block focus:outline-none"
                      title={`Abrir tela do SPED Fiscal (${nomeEmpresa})`}
                    >
                      <Card
                        className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${estiloCard}`}
                      >
                        <CardContent className="p-4 flex flex-col justify-between h-full">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                SPED do mês anterior
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors truncate mt-0.5">
                                {nomeEmpresa}
                              </h4>
                            </div>
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconeCor}`}
                            >
                              <FileSpreadsheet size={18} />
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center gap-2">
                              {badgeStatus}
                              <span className="text-[11px] text-slate-400 font-mono">({per})</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                              <span className="truncate">{textoDesc}</span>
                              <span className="text-slate-400 group-hover:text-primary ml-1 font-semibold">
                                →
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO COMPRAS E ENTRADA DE NOTAS (Etapa 3) — Respeita permissão de compras / notas_entrada */}
      {(podeVerCompras || podeVerNotasEntrada) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-t border-slate-200 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Visão Geral de Compras e Entradas
                </h2>
                {empresaAtiva && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Acompanhamento de conferência de notas fiscais, volume mensal e status de pedidos de
                compra.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {podeVerNotasEntrada && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/compras/notas-entrada">
                    Ver Notas
                    <ArrowRight size={13} />
                  </Link>
                </Button>
              )}
              {podeVerCompras && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/compras/pedidos">
                    Ver Pedidos
                    <ArrowRight size={13} />
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Cartões da Seção de Compras */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Notas em conferência (clicável para a listagem filtrada) */}
            {podeVerNotasEntrada && (
              <Link
                to="/compras/notas-entrada?status=Em%20conferência"
                className="group block focus:outline-none"
                title="Ver notas de entrada aguardando conferência e lançamento"
              >
                <Card
                  className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                    notasEmConferenciaCount > 0
                      ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-200'
                      : 'hover:border-slate-300'
                  }`}
                >
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-amber-800">
                        Notas em Conferência
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                        <FileText size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl font-bold tracking-tight text-amber-700 group-hover:text-amber-900 transition-colors flex items-center gap-2">
                        {carregando ? '—' : notasEmConferenciaCount}
                        {notasEmConferenciaCount > 0 && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 animate-pulse">
                            Pendente
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-amber-700/80 underline decoration-amber-300">
                        {notasEmConferenciaCount > 0
                          ? 'Aguardando validação fiscal →'
                          : 'Nenhuma nota pendente'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* 2. Compras do mês (valor total das notas lançadas no mês corrente) */}
            {podeVerNotasEntrada && (
              <Link
                to="/compras/livro-entradas"
                className="group block focus:outline-none"
                title="Abrir Livro de Entradas do mês"
              >
                <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Compras do Mês</span>
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <DollarSign size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xl font-bold tracking-tight text-emerald-700 font-mono">
                        {carregando ? '—' : formatarMoeda(comprasDoMesTotal)}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        notas lançadas no mês atual →
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* 3. Pedidos de compra em aberto (status "Enviado" ou "Parcialmente recebido") */}
            {podeVerCompras && (
              <Link
                to="/compras/pedidos"
                className="group block focus:outline-none"
                title="Ver pedidos de compra em andamento"
              >
                <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">Pedidos em Aberto</span>
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <ShoppingCart size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
                        {carregando ? '—' : pedidosCompraAbertosCount}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {pedidosCompraAbertosCount > 0
                          ? 'Enviados ou Parcialmente recebidos'
                          : 'Nenhum pedido em aberto'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* 4. Pedidos com previsão de entrega vencida */}
            {podeVerCompras && (
              <Link
                to="/compras/pedidos"
                className="group block focus:outline-none"
                title="Ver pedidos com entrega em atraso"
              >
                <Card
                  className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                    pedidosPrevisaoVencidaCount > 0
                      ? 'border-rose-300 bg-rose-50/25 ring-1 ring-rose-200'
                      : 'hover:border-slate-300'
                  }`}
                >
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-rose-800">Previsão Vencida</span>
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                        <CalendarClock size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl font-bold tracking-tight text-rose-700 group-hover:text-rose-900 transition-colors flex items-center gap-2">
                        {carregando ? '—' : pedidosPrevisaoVencidaCount}
                        {pedidosPrevisaoVencidaCount > 0 && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-200 text-rose-900">
                            Atrasado
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-rose-700/80">
                        {pedidosPrevisaoVencidaCount > 0
                          ? 'cobrar fornecedor / entrega em atraso →'
                          : 'nenhum pedido em atraso'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* SEÇÃO FINANCEIRO (Etapa 4) — Respeita permissões de pagar, receber e bancos */}
      {(podeVerFinanceiroPagar || podeVerFinanceiroReceber || podeVerFinanceiroBancos) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-t border-slate-200 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Visão Geral do Financeiro
                </h2>
                {empresaAtiva && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vencimentos do dia, títulos em atraso, disponibilidade bancária e projeção de fluxo
                de caixa.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {podeVerFinanceiroPagar && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/financeiro/pagar">
                    Contas a Pagar
                    <ArrowRight size={13} />
                  </Link>
                </Button>
              )}
              {podeVerFinanceiroReceber && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/financeiro/receber">
                    Contas a Receber
                    <ArrowRight size={13} />
                  </Link>
                </Button>
              )}
              {podeVerFinanceiroBancos && (
                <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Link to="/financeiro/fluxo-caixa">
                    Fluxo de Caixa
                    <ArrowRight size={13} />
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Cartões Financeiros da Etapa 4 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* 1. A Pagar Hoje (Clicável -> /financeiro/pagar com filtro de hoje) */}
            {podeVerFinanceiroPagar && (
              <Link
                to={`/financeiro/pagar?situacao=abertos&dataInicio=${new Date().toISOString().slice(0, 10)}&dataFim=${new Date().toISOString().slice(0, 10)}`}
                className="group block focus:outline-none"
                title="Ver títulos a pagar que vencem hoje"
              >
                <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">A Pagar Hoje</span>
                      <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                        <TrendingDown size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors font-mono">
                        {carregando ? '—' : formatarMoeda(aPagarHojeTotal)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">{aPagarHojeCount}</span>
                        <span>
                          {aPagarHojeCount === 1 ? 'título vence hoje' : 'títulos vencem hoje'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* 2. A Pagar Vencido (Clicável -> /financeiro/pagar filtrado por vencidos) */}
            {podeVerFinanceiroPagar && (
              <Link
                to="/financeiro/pagar?situacao=vencidos"
                className="group block focus:outline-none"
                title="Ver contas a pagar vencidas e em atraso"
              >
                <Card
                  className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                    aPagarVencidoCount > 0
                      ? 'border-rose-300 bg-rose-50/25 ring-1 ring-rose-200'
                      : 'hover:border-slate-300'
                  }`}
                >
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-rose-800">A Pagar Vencido</span>
                      <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                        <AlertTriangle size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xl font-bold tracking-tight text-rose-700 group-hover:text-rose-900 transition-colors font-mono flex items-center gap-2">
                        {carregando ? '—' : formatarMoeda(aPagarVencidoTotal)}
                      </div>
                      <div className="text-[11px] text-rose-700/80 mt-0.5 flex items-center gap-1.5">
                        <span className="font-semibold">{aPagarVencidoCount}</span>
                        <span>
                          {aPagarVencidoCount === 1 ? 'título em atraso →' : 'títulos em atraso →'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* 3. A Receber Hoje (Clicável -> /financeiro/receber com filtro de hoje) */}
            {podeVerFinanceiroReceber && (
              <Link
                to={`/financeiro/receber?situacao=abertos&dataInicio=${new Date().toISOString().slice(0, 10)}&dataFim=${new Date().toISOString().slice(0, 10)}`}
                className="group block focus:outline-none"
                title="Ver títulos a receber com vencimento hoje"
              >
                <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">A Receber Hoje</span>
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <TrendingUp size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors font-mono">
                        {carregando ? '—' : formatarMoeda(aReceberHojeTotal)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">{aReceberHojeCount}</span>
                        <span>
                          {aReceberHojeCount === 1 ? 'recebimento hoje' : 'recebimentos hoje'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* 4. A Receber Vencido (Clicável -> /financeiro/receber filtrado por vencidos) */}
            {podeVerFinanceiroReceber && (
              <Link
                to="/financeiro/receber?situacao=vencidos"
                className="group block focus:outline-none"
                title="Ver títulos a receber vencidos (inadimplência)"
              >
                <Card
                  className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                    aReceberVencidoCount > 0
                      ? 'border-amber-300 bg-amber-50/25 ring-1 ring-amber-200'
                      : 'hover:border-slate-300'
                  }`}
                >
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-amber-800">A Receber Vencido</span>
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                        <CalendarClock size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xl font-bold tracking-tight text-amber-800 group-hover:text-amber-900 transition-colors font-mono">
                        {carregando ? '—' : formatarMoeda(aReceberVencidoTotal)}
                      </div>
                      <div className="text-[11px] text-amber-800/80 mt-0.5 flex items-center gap-1.5">
                        <span className="font-semibold">{aReceberVencidoCount}</span>
                        <span>
                          {aReceberVencidoCount === 1
                            ? 'cliente inadimplente →'
                            : 'créditos em atraso →'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* 5. Saldo Total das Contas (Clicável -> /financeiro/bancos) */}
            {podeVerFinanceiroBancos && (
              <Link
                to="/financeiro/bancos"
                className="group block focus:outline-none"
                title="Ver saldo das contas bancárias e caixas"
              >
                <Card
                  className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                    saldoTotalContas < 0
                      ? 'border-rose-300 bg-rose-50/20'
                      : 'hover:border-slate-300'
                  }`}
                >
                  <CardContent className="p-4 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">
                        Saldo Total das Contas
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Landmark size={18} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div
                        className={`text-xl font-bold tracking-tight font-mono ${
                          saldoTotalContas < 0 ? 'text-rose-700' : 'text-slate-900'
                        }`}
                      >
                        {carregando ? '—' : formatarMoeda(saldoTotalContas)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700">
                          {totalContasCadastradas}
                        </span>
                        <span>
                          {totalContasCadastradas === 1
                            ? 'conta ativa cadastrada →'
                            : 'contas ativas cadastradas →'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>

          {/* Mini Gráfico do Fluxo de Caixa dos Próximos 30 Dias (visível com financeiro_bancos) */}
          {podeVerFinanceiroBancos && (
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-2 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <LineChartIcon className="w-4 h-4 text-blue-600" />
                    <CardTitle className="text-sm font-semibold text-slate-900">
                      Projeção do Fluxo de Caixa (Próximos 30 dias)
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Saldo diário projetado considerando saldos em conta, títulos a vencer e vencidos
                    em aberto.
                  </CardDescription>
                </div>

                <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-blue-600">
                  <Link to="/financeiro/fluxo-caixa">
                    Abrir fluxo completo
                    <ArrowRight size={12} className="ml-1" />
                  </Link>
                </Button>
              </CardHeader>

              <CardContent className="pt-4 pb-2">
                {carregandoFluxo ? (
                  <div className="h-56 flex flex-col items-center justify-center text-xs text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary mb-2" />
                    Calculando projeção financeira...
                  </div>
                ) : dadosFluxo30Dias.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-xs text-slate-500">
                    Nenhum dado financeiro disponível para projetar os próximos 30 dias.
                  </div>
                ) : (
                  <div className="h-56 w-full">
                    <ChartContainer
                      config={
                        {
                          saldoFinal: {
                            label: 'Saldo Projetado',
                            color: '#2563eb',
                          },
                          totalEntradas: {
                            label: 'Entradas Previstas',
                            color: '#10b981',
                          },
                          totalSaidas: {
                            label: 'Saídas Previstas',
                            color: '#f43f5e',
                          },
                        } satisfies ChartConfig
                      }
                      className="h-full w-full"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={dadosFluxo30Dias.map((p) => ({
                            rotulo: p.rotulo,
                            dataIso: p.dataInicioPeriodo,
                            totalEntradas: p.totalEntradas,
                            totalSaidas: p.totalSaidas,
                            saldoFinal: p.saldoFinalProjetado,
                          }))}
                          margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                          <XAxis
                            dataKey="rotulo"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={6}
                            interval={3}
                            className="text-[10px]"
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                            className="text-[10px]"
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value, name) => (
                                  <div className="flex items-center justify-between gap-4 font-mono text-xs">
                                    <span className="capitalize">{name}:</span>
                                    <span className="font-bold">
                                      R${' '}
                                      {Number(value || 0).toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                      })}
                                    </span>
                                  </div>
                                )}
                              />
                            }
                          />
                          <ChartLegend content={<ChartLegendContent />} />
                          <Bar
                            dataKey="totalEntradas"
                            name="Entradas"
                            fill="#10b981"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={14}
                          />
                          <Bar
                            dataKey="totalSaidas"
                            name="Saídas"
                            fill="#f43f5e"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={14}
                          />
                          <Line
                            type="monotone"
                            dataKey="saldoFinal"
                            name="Saldo Projetado"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Grid: Últimas Movimentações de Estoque & Últimos Cadastros / Pendências */}
      {podeVerEstoque && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  Últimas Movimentações do Estoque
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">10 mais recentes da empresa ativa</span>
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-blue-600">
                  <Link to="/estoque/kardex">
                    Ver Kardex
                    <ArrowRight size={12} className="ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Histórico recente de entradas, saídas, ajustes, transferências e inventários
              processados centralmente.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {carregando ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                Carregando movimentações...
              </div>
            ) : ultimasMovimentacoesEstoque.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Nenhuma movimentação de estoque registrada para a empresa ativa.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Data / Hora</th>
                      <th className="py-2.5 px-4">Tipo</th>
                      <th className="py-2.5 px-4">Origem</th>
                      <th className="py-2.5 px-4">Produto</th>
                      <th className="py-2.5 px-4 text-right">Qtd</th>
                      <th className="py-2.5 px-4 text-right">Custo Unit.</th>
                      <th className="py-2.5 px-4 text-right">Saldo Posterior</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ultimasMovimentacoesEstoque.map((mov) => {
                      const prod = mov.expand?.produto_id
                      const ehEntrada = mov.tipo === 'Entrada'
                      return (
                        <tr key={mov.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                            {formatarDataHora(mov.data_movimento || mov.created)}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={`gap-1 text-[10px] ${
                                ehEntrada
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {ehEntrada ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownLeft className="h-3 w-3" />
                              )}
                              {mov.tipo}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {mov.origem}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900 max-w-xs truncate">
                              {prod?.descricao || 'Produto não identificado'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Cód: {prod?.codigo || '-'}
                            </div>
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono font-semibold ${
                              ehEntrada ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {ehEntrada ? '+' : '-'}
                            {Number(mov.quantidade).toLocaleString('pt-BR', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                            {formatarMoeda(Number(mov.custo_unitario) || 0)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {Number(mov.saldo_posterior || 0).toLocaleString('pt-BR', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 4,
                            })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid: Últimos Cadastros e Pendências de Configuração */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lista: Últimos Cadastros (10 mais recentes intercalados) */}
        <div className="lg:col-span-7">
          <Card className="border-slate-200 shadow-xs h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Últimos Cadastros
                  </CardTitle>
                </div>
                <span className="text-xs text-slate-400">10 mais recentes</span>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Últimos registros incluídos em clientes, fornecedores e produtos.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
              {carregando ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                  Carregando registros...
                </div>
              ) : ultimosCadastros.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 my-auto">
                  Nenhum cadastro recente encontrado ou você não possui permissão para
                  visualizá-los.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ultimosCadastros.map((item) => (
                    <Link
                      key={`${item.tipo}-${item.id}`}
                      to={item.urlDetalhe}
                      className="flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${
                            item.tipo === 'cliente'
                              ? 'bg-blue-100 text-blue-800'
                              : item.tipo === 'fornecedor'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {item.tipoLabel}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-semibold text-slate-500">
                              #{item.codigo}
                            </span>
                            <span className="text-xs font-medium text-slate-900 truncate group-hover:text-primary transition-colors">
                              {item.identificacao}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Incluído em {formatarDataHora(item.criadoEm)}
                          </p>
                        </div>
                      </div>

                      <ArrowRight
                        size={14}
                        className="text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lista: Pendências de Configuração */}
        <div className="lg:col-span-5">
          <Card className="border-slate-200 shadow-xs h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Pendências de Configuração
                  </CardTitle>
                </div>
                {pendencias.length > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-50 text-amber-800 border-amber-200 font-bold"
                  >
                    {pendencias.length} {pendencias.length === 1 ? 'item' : 'itens'}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-slate-500">
                Itens fiscais e cadastrais recomendados antes de iniciar emissões e vendas.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
              {carregando ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                  Verificando pendências...
                </div>
              ) : pendencias.length === 0 ? (
                <div className="p-8 text-center text-xs text-emerald-700 bg-emerald-50/40 rounded-b-xl my-auto flex flex-col items-center gap-2">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                  <p className="font-semibold">Nenhuma pendência crítica!</p>
                  <p className="text-slate-500 max-w-xs text-center text-[11px]">
                    As configurações de empresa, tabelas fiscais e perfis tributários essenciais
                    estão preenchidas.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pendencias.map((pend) => (
                    <div key={pend.id} className="p-3.5 hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              {pend.titulo}
                            </span>
                            {pend.gravidade === 'alta' ? (
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded">
                                Urgente
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                                Importante
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">{pend.descricao}</p>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex justify-end">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 gap-1.5 px-2"
                        >
                          <Link to={pend.link}>
                            Configurar agora
                            <ArrowRight size={12} />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
