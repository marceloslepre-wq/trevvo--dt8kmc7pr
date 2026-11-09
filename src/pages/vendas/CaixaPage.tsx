import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import { listarSessoesCaixa, obterSessaoAbertaOperador, type CaixaSessao } from '@/services/caixa'
import { listarTerminais, type Terminal } from '@/services/terminais'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Lock,
  Unlock,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Eye,
  ShieldCheck,
  AlertTriangle,
  Receipt,
  FileDown,
  Building,
} from 'lucide-react'
import { ModalAbrirCaixa } from './caixa/ModalAbrirCaixa'
import { ModalSangria } from './caixa/ModalSangria'
import { ModalSuprimento } from './caixa/ModalSuprimento'
import { ModalFecharCaixa } from './caixa/ModalFecharCaixa'
import { ModalConferirCaixa } from './caixa/ModalConferirCaixa'
import { ModalDetalhesSessao } from './caixa/ModalDetalhesSessao'
import { imprimirRelatorioFechamentoPdf } from '@/services/caixaImpressao'

export default function CaixaPage() {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, perfil, usuarioERP } = usePermissoes()
  const { toast } = useToast()

  const podeOperarCaixa = Boolean(usuarioERP?.e_caixa)
  const ehSupervisorOuAdmin = Boolean(perfil?.administrador || pode('caixa', 'editar'))

  // Filtros
  const [terminalFiltro, setTerminalFiltro] = useState('')
  const [operadorFiltro, setOperadorFiltro] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<'Aberto' | 'Fechado' | ''>('')
  const [dataInicioFiltro, setDataInicioFiltro] = useState('')
  const [dataFimFiltro, setDataFimFiltro] = useState('')

  // Listas de apoio
  const [terminais, setTerminais] = useState<Terminal[]>([])
  const [operadores, setOperadores] = useState<Array<{ id: string; nome: string }>>([])

  // Dados da tabela
  const [sessoes, setSessoes] = useState<CaixaSessao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [sessaoAbertaMinha, setSessaoAbertaMinha] = useState<CaixaSessao | null>(null)

  // Modais
  const [modalAbrirOpen, setModalAbrirOpen] = useState(false)
  const [modalSangriaOpen, setModalSangriaOpen] = useState(false)
  const [modalSuprimentoOpen, setModalSuprimentoOpen] = useState(false)
  const [modalFecharOpen, setModalFecharOpen] = useState(false)
  const [modalConferirOpen, setModalConferirOpen] = useState(false)
  const [modalDetalhesOpen, setModalDetalhesOpen] = useState(false)

  const [sessaoSelecionada, setSessaoSelecionada] = useState<CaixaSessao | null>(null)

  // Carregar filtros auxiliares (terminais e operadores)
  useEffect(() => {
    if (!empresaAtiva) return

    async function carregarAuxiliares() {
      try {
        const terms = await listarTerminais(empresaAtiva!.id)
        setTerminais(terms)

        const users = await pb.collection('usuarios').getFullList<{ id: string; nome: string }>({
          filter: `empresa_id = '${empresaAtiva!.id}' && ativo = true`,
          sort: 'nome',
        })
        setOperadores(users)
      } catch {
        // silencioso
      }
    }

    carregarAuxiliares()
  }, [empresaAtiva])

  // Carregar lista de sessões e minha sessão aberta
  const carregarDados = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregando(true)
    try {
      const resp = await listarSessoesCaixa({
        empresaId: empresaAtiva.id,
        terminalId: terminalFiltro || undefined,
        operadorId: operadorFiltro || undefined,
        status: statusFiltro || undefined,
        dataInicio: dataInicioFiltro || undefined,
        dataFim: dataFimFiltro || undefined,
      })
      setSessoes(resp.items)

      if (usuarioERP) {
        const minha = await obterSessaoAbertaOperador(empresaAtiva.id, usuarioERP.id)
        setSessaoAbertaMinha(minha)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao listar sessões de caixa.'
      toast({ title: 'Erro', description: msg, variant: 'destructive' })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaAtiva,
    terminalFiltro,
    operadorFiltro,
    statusFiltro,
    dataInicioFiltro,
    dataFimFiltro,
    usuarioERP,
    toast,
  ])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Ações de modal
  function handleAbrirSangria(sessao: CaixaSessao) {
    setSessaoSelecionada(sessao)
    setModalSangriaOpen(true)
  }

  function handleAbrirSuprimento(sessao: CaixaSessao) {
    setSessaoSelecionada(sessao)
    setModalSuprimentoOpen(true)
  }

  function handleAbrirFechamento(sessao: CaixaSessao) {
    setSessaoSelecionada(sessao)
    setModalFecharOpen(true)
  }

  function handleAbrirConferencia(sessao: CaixaSessao) {
    setSessaoSelecionada(sessao)
    setModalConferirOpen(true)
  }

  function handleAbrirDetalhes(sessao: CaixaSessao) {
    setSessaoSelecionada(sessao)
    setModalDetalhesOpen(true)
  }

  function handleImprimirPdfDireto(sessao: CaixaSessao) {
    imprimirRelatorioFechamentoPdf({
      sessao,
      movimentos: [],
      empresaNome: empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa',
      terminalNome: sessao.expand?.pdv_terminal_id?.nome || 'Terminal',
      operadorNome: sessao.expand?.operador_id?.nome || 'Operador',
      supervisorNome: sessao.expand?.conferido_por_id?.nome,
    })
  }

  // Resumo estatístico
  const resumoCards = useMemo(() => {
    let abertos = 0
    let fechados = 0
    let comDiferenca = 0
    for (const s of sessoes) {
      if (s.status === 'Aberto') abertos++
      if (s.status === 'Fechado') fechados++
      if (Math.abs(Number(s.diferenca_dinheiro || 0)) >= 0.01) comDiferenca++
    }
    return { abertos, fechados, comDiferenca }
  }, [sessoes])

  if (!empresaAtiva) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        Selecione uma empresa ativa para gerenciar o controle de caixa.
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-sky-600" />
            Controle de Caixa
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerenciamento de turnos, abertura de terminais, sangrias, suprimentos e fechamento "às
            cegas".
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sessaoAbertaMinha ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAbrirSangria(sessaoAbertaMinha)}
                className="text-rose-700 border-rose-200 hover:bg-rose-50 text-xs"
              >
                <ArrowDownLeft className="h-4 w-4 mr-1 text-rose-600" />
                Sangria
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAbrirSuprimento(sessaoAbertaMinha)}
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs"
              >
                <ArrowUpRight className="h-4 w-4 mr-1 text-emerald-600" />
                Suprimento
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleAbrirFechamento(sessaoAbertaMinha)}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
              >
                <Lock className="h-4 w-4 mr-1" />
                Fechar Meu Caixa
              </Button>
            </>
          ) : podeOperarCaixa ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setModalAbrirOpen(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
            >
              <Unlock className="h-4 w-4 mr-1" />
              Abrir Caixa
            </Button>
          ) : (
            <div className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
              * Seu usuário não possui flag <strong>e_caixa = true</strong> para abrir terminal.
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={carregando}
            className="text-xs h-9"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Banner de Sessão Ativa do Operador Logado */}
      {sessaoAbertaMinha && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-sky-500/10 via-sky-50 to-transparent border border-sky-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-600 text-white rounded-lg">
              <Unlock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
                  Sua Sessão Está Aberta
                </span>
                <Badge className="bg-emerald-600 text-white text-[10px] h-4">Ativa</Badge>
              </div>
              <p className="text-xs text-slate-700 mt-0.5">
                Terminal:{' '}
                <strong>{sessaoAbertaMinha.expand?.pdv_terminal_id?.nome || 'Terminal'}</strong> |
                Fundo inicial:{' '}
                <strong>R$ {Number(sessaoAbertaMinha.valor_abertura || 0).toFixed(2)}</strong> |
                Abertura: {new Date(sessaoAbertaMinha.data_abertura).toLocaleTimeString('pt-BR')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAbrirDetalhes(sessaoAbertaMinha)}
              className="text-xs h-8 bg-white"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              Ver Detalhes
            </Button>
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Caixas Abertos
          </span>
          <span className="text-2xl font-bold font-mono text-emerald-600 mt-1 block">
            {resumoCards.abertos}
          </span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Caixas Fechados (Filtro)
          </span>
          <span className="text-2xl font-bold font-mono text-slate-700 mt-1 block">
            {resumoCards.fechados}
          </span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Com Diferença de Dinheiro
          </span>
          <span
            className={`text-2xl font-bold font-mono mt-1 block ${
              resumoCards.comDiferenca > 0 ? 'text-rose-600' : 'text-slate-700'
            }`}
          >
            {resumoCards.comDiferenca}
          </span>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-semibold text-slate-700">
          <Filter className="h-4 w-4 text-sky-600" />
          Filtros de Pesquisa
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-600">Terminal</Label>
            <select
              value={terminalFiltro}
              onChange={(e) => setTerminalFiltro(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-slate-300 bg-white text-slate-800 text-xs"
            >
              <option value="">Todos os Terminais</option>
              {terminais.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-slate-600">Operador</Label>
            <select
              value={operadorFiltro}
              onChange={(e) => setOperadorFiltro(e.target.value)}
              className="w-full h-8 px-2 rounded-md border border-slate-300 bg-white text-slate-800 text-xs"
            >
              <option value="">Todos os Operadores</option>
              {operadores.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-slate-600">Status</Label>
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as 'Aberto' | 'Fechado' | '')}
              className="w-full h-8 px-2 rounded-md border border-slate-300 bg-white text-slate-800 text-xs"
            >
              <option value="">Todos os Status</option>
              <option value="Aberto">Aberto</option>
              <option value="Fechado">Fechado</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-slate-600">Data Início</Label>
            <Input
              type="date"
              value={dataInicioFiltro}
              onChange={(e) => setDataInicioFiltro(e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-slate-600">Data Fim</Label>
            <Input
              type="date"
              value={dataFimFiltro}
              onChange={(e) => setDataFimFiltro(e.target.value)}
              className="h-8 text-xs bg-white"
            />
          </div>
        </div>
      </div>

      {/* Tabela de Sessões */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 text-left">Sessão / Terminal</th>
                <th className="py-2.5 px-3 text-left">Operador</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-left">Abertura / Fechamento</th>
                <th className="py-2.5 px-3 text-right">Fundo Troco</th>
                <th className="py-2.5 px-3 text-right">Vendas (Qtd)</th>
                <th className="py-2.5 px-3 text-right">Sangria / Supr.</th>
                <th className="py-2.5 px-3 text-right">Diferença Dinheiro</th>
                <th className="py-2.5 px-3 text-center">Conferência</th>
                <th className="py-2.5 px-3 text-center w-36">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carregando ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Carregando sessões de caixa...
                  </td>
                </tr>
              ) : sessoes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Nenhuma sessão de caixa encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                sessoes.map((s) => {
                  const dif = Number(s.diferenca_dinheiro || 0)
                  const temDif = Math.abs(dif) >= 0.01
                  const ehMinha = usuarioERP && s.operador_id === usuarioERP.id

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-slate-50 ${
                        temDif && s.status === 'Fechado' ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-slate-900 block">
                          #{s.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate block">
                          {s.expand?.pdv_terminal_id?.nome || 'Terminal'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-800 block">
                          {s.expand?.operador_id?.nome || 'Operador'}
                        </span>
                        {ehMinha && (
                          <span className="text-[10px] text-sky-600 font-bold block">(Você)</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            s.status === 'Aberto'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                              : 'bg-slate-100 text-slate-700 border-slate-300 text-[10px]'
                          }
                        >
                          {s.status}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3 text-slate-600">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Aberto:</span>
                          <span className="font-mono">
                            {s.data_abertura
                              ? new Date(s.data_abertura).toLocaleString('pt-BR')
                              : '-'}
                          </span>
                        </div>
                        {s.data_fechamento && (
                          <div className="mt-1">
                            <span className="text-[10px] text-slate-400 block">Fechado:</span>
                            <span className="font-mono">
                              {new Date(s.data_fechamento).toLocaleString('pt-BR')}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700">
                        R$ {Number(s.valor_abertura || 0).toFixed(2)}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono font-semibold text-slate-900 block">
                          R$ {Number(s.valor_vendas || 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {s.quantidade_vendas || 0} venda(s)
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                        <span className="text-rose-600 block">
                          - R$ {Number(s.valor_sangrias || 0).toFixed(2)}
                        </span>
                        <span className="text-emerald-600 block">
                          + R$ {Number(s.valor_suprimentos || 0).toFixed(2)}
                        </span>
                      </td>

                      {/* Destaque para diferenças diferentes de zero */}
                      <td className="py-2.5 px-3 text-right">
                        {s.status === 'Aberto' || !s.data_conferencia ? (
                          <span className="text-slate-400 italic">
                            {s.status === 'Aberto' ? 'Em turno' : 'Aguardando conferência'}
                          </span>
                        ) : (
                          <span
                            className={`font-mono font-bold block ${
                              !temDif
                                ? 'text-emerald-700'
                                : dif < 0
                                  ? 'text-rose-700 bg-rose-100/60 px-1.5 py-0.5 rounded-sm inline-block'
                                  : 'text-blue-700 bg-blue-100/60 px-1.5 py-0.5 rounded-sm inline-block'
                            }`}
                          >
                            R$ {Math.abs(dif).toFixed(2)}{' '}
                            {dif < 0 ? '(- falta)' : dif > 0 ? '(+ sobra)' : '(exato)'}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {s.data_conferencia ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold"
                            title={`Conferido por ${s.expand?.conferido_por_id?.nome || 'Supervisor'} em ${new Date(s.data_conferencia).toLocaleString('pt-BR')}`}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                            Conferido
                          </span>
                        ) : s.status === 'Fechado' ? (
                          <span className="text-[11px] text-amber-600 font-medium">Pendente</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAbrirDetalhes(s)}
                            className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900"
                            title="Ver Detalhes da Sessão"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          {s.status === 'Aberto' && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAbrirSangria(s)}
                                className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                                title="Sangria de Caixa"
                              >
                                <ArrowDownLeft className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAbrirSuprimento(s)}
                                className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                title="Suprimento de Caixa"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAbrirFechamento(s)}
                                className="h-7 w-7 p-0 text-amber-600 hover:bg-amber-50"
                                title="Fechar Caixa"
                              >
                                <Lock className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          {s.status === 'Fechado' && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleImprimirPdfDireto(s)}
                                className="h-7 w-7 p-0 text-sky-600 hover:bg-sky-50"
                                title="Imprimir Relatório em PDF"
                              >
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>

                              {!s.data_conferencia && ehSupervisorOuAdmin && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAbrirConferencia(s)}
                                  className="h-7 w-7 p-0 text-indigo-600 hover:bg-indigo-50"
                                  title="Conferir como Supervisor"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAIS */}
      {modalAbrirOpen && (
        <ModalAbrirCaixa
          open={modalAbrirOpen}
          onOpenChange={setModalAbrirOpen}
          empresaId={empresaAtiva.id}
          onSucesso={carregarDados}
        />
      )}

      {modalSangriaOpen && sessaoSelecionada && (
        <ModalSangria
          open={modalSangriaOpen}
          onOpenChange={setModalSangriaOpen}
          sessao={sessaoSelecionada}
          empresaNome={empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
          onSucesso={carregarDados}
        />
      )}

      {modalSuprimentoOpen && sessaoSelecionada && (
        <ModalSuprimento
          open={modalSuprimentoOpen}
          onOpenChange={setModalSuprimentoOpen}
          sessao={sessaoSelecionada}
          onSucesso={carregarDados}
        />
      )}

      {modalFecharOpen && sessaoSelecionada && (
        <ModalFecharCaixa
          open={modalFecharOpen}
          onOpenChange={setModalFecharOpen}
          sessao={sessaoSelecionada}
          empresaId={empresaAtiva.id}
          empresaNome={empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
          onSucesso={carregarDados}
        />
      )}

      {modalConferirOpen && sessaoSelecionada && (
        <ModalConferirCaixa
          open={modalConferirOpen}
          onOpenChange={setModalConferirOpen}
          sessao={sessaoSelecionada}
          onSucesso={carregarDados}
        />
      )}

      {modalDetalhesOpen && (
        <ModalDetalhesSessao
          open={modalDetalhesOpen}
          onOpenChange={setModalDetalhesOpen}
          sessao={sessaoSelecionada}
          empresaNome={empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
          onAbrirConferencia={handleAbrirConferencia}
          podeConferir={ehSupervisorOuAdmin}
        />
      )}
    </div>
  )
}
