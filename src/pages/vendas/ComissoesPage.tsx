import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Award,
  CheckCircle,
  DollarSign,
  User,
  FileText,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Percent,
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
import { AcessoNegado } from '@/components/AcessoNegado'
import FiltrosRelatorio from '@/components/relatorios/FiltrosRelatorio'
import { ObjetoFiltrosRelatorio, ChaveFiltroDeclaravel } from '@/services/relatorios'
import {
  apurarComissoes,
  gerarContaPagarComissao,
  exportarComissoesCsv,
  ItemComissaoVendedor,
} from '@/services/comissoes'

export const ComissoesPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { usuarioERP, administrador, perfil, pode } = usePermissoes()
  const { toast } = useToast()

  // Regra de acesso: só Administrador, Gerente e Financeiro ou quem pode ver vendas
  const perfilNome = (perfil?.nome || usuarioERP?.expand?.perfil_id?.nome || '').toLowerCase()
  const temAcesso =
    administrador ||
    pode('vendas', 'ver') ||
    perfilNome.includes('gerente') ||
    perfilNome.includes('admin') ||
    perfilNome.includes('financeiro')

  // Filtros
  const hoje = new Date()
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const hojeIso = hoje.toISOString().slice(0, 10)

  // Estado FiltrosRelatorio (8.0b)
  const [filtros, setFiltros] = useState<ObjetoFiltrosRelatorio>({
    empresas_ids: empresaAtiva?.id ? [empresaAtiva.id] : [],
    atalho_periodo: 'este_mes',
    periodo: {
      dataInicio: primeiroDiaMes,
      dataFim: hojeIso,
    },
    tipo_data: 'emissao',
    vendedores_ids: [],
  })

  const filtrosDeclarados = useMemo<ChaveFiltroDeclaravel[]>(
    () => ['pessoas_vendedores', 'datas_tipo_data'],
    [],
  )

  const [baseCalculo, setBaseCalculo] = useState<'Venda finalizada' | 'Venda recebida'>(
    'Venda finalizada',
  )

  const dataInicioEfetiva = filtros.periodo?.dataInicio || primeiroDiaMes
  const dataFimEfetiva = filtros.periodo?.dataFim || hojeIso
  const empresaIdEfetiva = filtros.empresas_ids?.[0] || empresaAtiva?.id || ''
  const vendedorIdEfetivo =
    filtros.vendedores_ids && filtros.vendedores_ids.length > 0
      ? filtros.vendedores_ids[0]
      : 'todos'

  // Dados apurados
  const [comissoes, setComissoes] = useState<ItemComissaoVendedor[]>([])
  const [carregando, setCarregando] = useState(false)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  // Modal para Gerar Conta a Pagar da comissão
  const [modalGerarAberto, setModalGerarAberto] = useState(false)
  const [vendedorSelecionado, setVendedorSelecionado] = useState<ItemComissaoVendedor | null>(null)
  const [dataVencimentoTitulo, setDataVencimentoTitulo] = useState(hojeIso)
  const [gerandoTitulo, setGerandoTitulo] = useState(false)

  // Buscar apuração de comissões
  const carregarApuracao = useCallback(async () => {
    if (!empresaIdEfetiva) return
    setCarregando(true)
    try {
      const res = await apurarComissoes({
        empresa_id: empresaIdEfetiva,
        data_inicio: dataInicioEfetiva,
        data_fim: dataFimEfetiva,
        vendedor_id: vendedorIdEfetivo,
        base_calculo: baseCalculo,
      })
      setComissoes(res)
    } catch {
      toast({
        title: 'Erro na apuração',
        description: 'Não foi possível carregar as comissões do período.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaIdEfetiva, dataInicioEfetiva, dataFimEfetiva, vendedorIdEfetivo, baseCalculo, toast])

  useEffect(() => {
    if (temAcesso) {
      carregarApuracao()
    }
  }, [carregarApuracao, temAcesso])

  if (!temAcesso) {
    return (
      <AcessoNegado mensagem="Acesso Restrito: Apenas Administradores, Gerentes e usuários do departamento Financeiro possuem permissão para apurar comissões de vendas." />
    )
  }

  // Alternar expansão do detalhe do vendedor
  const toggleExpandir = (id: string) => {
    setExpandidos((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Totais consolidados
  const totalGeralVendas = comissoes.reduce((acc, c) => acc + c.total_vendas_bruto, 0)
  const totalGeralDevolucoes = comissoes.reduce((acc, c) => acc + c.total_devolucoes, 0)
  const totalGeralBase = comissoes.reduce((acc, c) => acc + c.base_calculo, 0)
  const totalGeralComissao = comissoes.reduce((acc, c) => acc + c.valor_comissao, 0)

  // Exportar CSV
  const handleExportarCsv = () => {
    const csvContent = exportarComissoesCsv(
      comissoes,
      `${dataInicioEfetiva.split('-').reverse().join('/')} até ${dataFimEfetiva.split('-').reverse().join('/')}`,
    )
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `comissoes_${dataInicioEfetiva}_a_${dataFimEfetiva}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Abrir modal para gerar conta a pagar
  const handleAbrirModalGerar = (item: ItemComissaoVendedor) => {
    setVendedorSelecionado(item)
    // Sugere vencimento no 5º dia útil do próximo mês ou 10 dias à frente
    const dtv = new Date()
    dtv.setDate(dtv.getDate() + 10)
    setDataVencimentoTitulo(dtv.toISOString().slice(0, 10))
    setModalGerarAberto(true)
  }

  // Confirmar geração de conta a pagar
  const handleConfirmarGerarTitulo = async () => {
    if (!empresaIdEfetiva || !vendedorSelecionado) return
    setGerandoTitulo(true)
    try {
      const periodoTexto = `${dataInicioEfetiva.split('-').reverse().join('/')} a ${dataFimEfetiva
        .split('-')
        .reverse()
        .join('/')}`
      await gerarContaPagarComissao({
        empresa_id: empresaIdEfetiva,
        vendedor_id: vendedorSelecionado.vendedor_id,
        valor_comissao: vendedorSelecionado.valor_comissao,
        data_vencimento: dataVencimentoTitulo,
        periodo_referencia: periodoTexto,
      })

      toast({
        title: 'Conta a Pagar Gerada',
        description: `Título de comissão (R$ ${vendedorSelecionado.valor_comissao.toFixed(
          2,
        )}) criado com sucesso no plano 2.5.01.`,
      })
      setModalGerarAberto(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao gerar conta a pagar.'
      toast({
        title: 'Erro ao gerar título',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setGerandoTitulo(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Componente Comum de Filtros 8.0b */}
      <FiltrosRelatorio
        relatorioId="vendas_comissoes"
        tituloRelatorio="Comissões de Vendas"
        subtituloRelatorio="Apuração por vendedor baseada no percentual cadastrado, deduzindo devoluções e trocas."
        filtrosDeclarados={filtrosDeclarados}
        filtros={filtros}
        onChange={setFiltros}
        onFiltrar={carregarApuracao}
        onExportarCsv={handleExportarCsv}
        carregando={carregando}
        filtrosExtras={
          <div className="space-y-1 min-w-[200px]">
            <label className="text-[11px] font-semibold text-slate-600 block">
              Base de Cálculo
            </label>
            <select
              value={baseCalculo}
              onChange={(e) => setBaseCalculo(e.target.value as any)}
              className="text-xs h-9 w-full bg-white border border-slate-200 rounded-md px-2"
            >
              <option value="Venda finalizada">Venda finalizada (Emissão)</option>
              <option value="Venda recebida">Venda recebida (Liquidação)</option>
            </select>
          </div>
        }
      />

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Total de Vendas</p>
              <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                R$ {totalGeralVendas.toFixed(2)}
              </p>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Devoluções / Estornos</p>
              <p className="text-xl font-bold text-red-600 mt-1 font-mono">
                R$ {totalGeralDevolucoes.toFixed(2)}
              </p>
            </div>
            <div className="p-2.5 bg-red-50 text-red-600 rounded-lg">
              <Percent className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">Base Líquida</p>
              <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                R$ {totalGeralBase.toFixed(2)}
              </p>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-amber-50/40 border-amber-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-800 font-semibold">Total em Comissões</p>
              <p className="text-xl font-bold text-amber-700 mt-1 font-mono">
                R$ {totalGeralComissao.toFixed(2)}
              </p>
            </div>
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-lg">
              <Award className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Vendedores */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-slate-900">
            Apuração por Vendedor
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Clique na linha do vendedor para visualizar o extrato detalhado de vendas e devoluções.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-xs text-slate-400 py-6 text-center">Calculando comissões...</p>
          ) : comissoes.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Nenhuma comissão apurada para os filtros selecionados.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="text-xs">Vendedor</TableHead>
                    <TableHead className="text-xs text-right">Vendas Brutas (R$)</TableHead>
                    <TableHead className="text-xs text-right">Devoluções (R$)</TableHead>
                    <TableHead className="text-xs text-right">Base Líquida (R$)</TableHead>
                    <TableHead className="text-xs text-right">% Comis.</TableHead>
                    <TableHead className="text-xs text-right font-bold">Comissão (R$)</TableHead>
                    <TableHead className="text-xs text-center w-36">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoes.map((c) => {
                    const aberto = !!expandidos[c.vendedor_id]
                    return (
                      <React.Fragment key={c.vendedor_id}>
                        <TableRow className="hover:bg-slate-50/80 cursor-pointer">
                          <TableCell onClick={() => toggleExpandir(c.vendedor_id)}>
                            {aberto ? (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                          </TableCell>
                          <TableCell
                            onClick={() => toggleExpandir(c.vendedor_id)}
                            className="text-xs font-medium text-slate-900"
                          >
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span>{c.vendedor_nome}</span>
                            </div>
                            {c.vendedor_email && (
                              <span className="text-[10px] text-slate-400 block ml-5">
                                {c.vendedor_email}
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            onClick={() => toggleExpandir(c.vendedor_id)}
                            className="text-xs text-right font-mono"
                          >
                            R$ {c.total_vendas_bruto.toFixed(2)} ({c.quantidade_vendas})
                          </TableCell>
                          <TableCell
                            onClick={() => toggleExpandir(c.vendedor_id)}
                            className="text-xs text-right font-mono text-red-600"
                          >
                            {c.total_devolucoes > 0
                              ? `- R$ ${c.total_devolucoes.toFixed(2)}`
                              : 'R$ 0,00'}
                          </TableCell>
                          <TableCell
                            onClick={() => toggleExpandir(c.vendedor_id)}
                            className="text-xs text-right font-mono font-semibold"
                          >
                            R$ {c.base_calculo.toFixed(2)}
                          </TableCell>
                          <TableCell
                            onClick={() => toggleExpandir(c.vendedor_id)}
                            className="text-xs text-right font-mono"
                          >
                            {c.percentual_comissao.toFixed(2)}%
                          </TableCell>
                          <TableCell
                            onClick={() => toggleExpandir(c.vendedor_id)}
                            className="text-xs text-right font-mono font-bold text-amber-700 bg-amber-50/30"
                          >
                            R$ {c.valor_comissao.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={c.valor_comissao <= 0}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAbrirModalGerar(c)
                              }}
                              className="text-[11px] h-7 px-2 border-amber-300 text-amber-800 hover:bg-amber-50"
                            >
                              <DollarSign className="h-3 w-3 mr-1" />
                              Gerar a Pagar
                            </Button>
                          </TableCell>
                        </TableRow>

                        {/* Detalhe expandido das vendas do vendedor */}
                        {aberto && (
                          <TableRow className="bg-slate-50/60">
                            <TableCell colSpan={8} className="p-4">
                              <div className="bg-white rounded-md border border-slate-200 p-3 space-y-2">
                                <p className="text-xs font-semibold text-slate-800">
                                  Extrato Detalhado de Vendas ({c.vendas_detalhe.length}{' '}
                                  lançamentos)
                                </p>
                                <div className="max-h-60 overflow-y-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="border-b border-slate-200">
                                        <TableHead className="text-[11px]">Venda #</TableHead>
                                        <TableHead className="text-[11px]">Data</TableHead>
                                        <TableHead className="text-[11px]">Cliente</TableHead>
                                        <TableHead className="text-[11px]">Tipo</TableHead>
                                        <TableHead className="text-[11px] text-right">
                                          Valor (R$)
                                        </TableHead>
                                        <TableHead className="text-[11px] text-right">
                                          Base (R$)
                                        </TableHead>
                                        <TableHead className="text-[11px] text-right">
                                          Comissão (R$)
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {c.vendas_detalhe.map((det) => (
                                        <TableRow key={det.venda_id} className="text-xs">
                                          <TableCell className="font-mono">#{det.numero}</TableCell>
                                          <TableCell>
                                            {det.data_emissao
                                              ? det.data_emissao.split('-').reverse().join('/')
                                              : '-'}
                                          </TableCell>
                                          <TableCell>{det.cliente_nome}</TableCell>
                                          <TableCell>
                                            <Badge
                                              variant="outline"
                                              className={`text-[9px] ${
                                                det.tipo === 'Devolução'
                                                  ? 'border-red-300 text-red-700 bg-red-50'
                                                  : ''
                                              }`}
                                            >
                                              {det.tipo}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            {det.tipo === 'Devolução'
                                              ? `- R$ ${det.valor_devolucao.toFixed(2)}`
                                              : `R$ ${det.valor_venda.toFixed(2)}`}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            R$ {det.base_comissao.toFixed(2)}
                                          </TableCell>
                                          <TableCell
                                            className={`text-right font-mono font-medium ${
                                              det.valor_comissao < 0
                                                ? 'text-red-600'
                                                : 'text-amber-700'
                                            }`}
                                          >
                                            R$ {det.valor_comissao.toFixed(2)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Gerar Conta a Pagar */}
      <Dialog open={modalGerarAberto} onOpenChange={setModalGerarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Gerar Conta a Pagar de Comissão
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Criação de título no Contas a Pagar (Plano 2.5.01 - Comissões).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {vendedorSelecionado && (
            <div className="space-y-4 py-2 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Vendedor:</span>
                  <span className="font-bold text-slate-900">
                    {vendedorSelecionado.vendedor_nome}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor da Comissão:</span>
                  <span className="font-bold text-amber-700">
                    R$ {vendedorSelecionado.valor_comissao.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Período:</span>
                  <span>
                    {dataInicioEfetiva.split('-').reverse().join('/')} a{' '}
                    {dataFimEfetiva.split('-').reverse().join('/')}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-slate-700">Data de Vencimento</Label>
                <Input
                  type="date"
                  value={dataVencimentoTitulo}
                  onChange={(e) => setDataVencimentoTitulo(e.target.value)}
                  className="text-xs h-9 bg-white"
                />
              </div>

              <p className="text-[11px] text-slate-500">
                Se o vendedor ainda não estiver cadastrado como fornecedor, um cadastro automático
                será gerado a partir do seu cadastro de usuário.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalGerarAberto(false)}
              disabled={gerandoTitulo}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={gerandoTitulo}
              onClick={handleConfirmarGerarTitulo}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              <span>{gerandoTitulo ? 'Gerando...' : 'Confirmar Geração'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
